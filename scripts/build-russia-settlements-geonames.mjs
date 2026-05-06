/**
 * Build app/data/russia-settlements.json from GeoNames RU.txt
 * Run: node scripts/build-russia-settlements-geonames.mjs
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "app/data/raw/RU.txt");
const OUTPUT = path.join(ROOT, "app/data/russia-settlements.json");

const ALLOWED_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLC",
  "PPLX",
  "PPLL",
  "PPLQ",
  "PPLS",
  "PPLW",
]);

const FEATURE_RANK = {
  PPLC: 0,
  PPLA: 1,
  PPLA2: 2,
  PPLA3: 3,
  PPLA4: 4,
  PPL: 5,
  PPLX: 6,
  PPLL: 7,
  PPLQ: 8,
  PPLS: 9,
  PPLW: 10,
};

function featureRank(code) {
  return FEATURE_RANK[code] ?? 99;
}

function hasCyrillic(text) {
  return /[А-Яа-яЁё]/.test(text);
}

function hasLatin(text) {
  return /[A-Za-z]/.test(text);
}

/** Prefer Cyrillic-only readable tokens (letters, spaces, hyphens). */
function alternatePenalty(s) {
  const hasParen = /\([^)]*\)/.test(s) ? 1 : 0;
  const hasDig = /\d/.test(s) ? 1 : 0;
  const core = s.replace(/\([^)]*\)/g, "").trim();
  const weird = /[^\s\-А-Яа-яЁё]/u.test(core) ? 1 : 0;
  return [hasParen, hasDig, weird, core.length, s];
}

/** Letters/spaces/hyphens only (excludes Latin letters and typos like «Мæскуы»). */
function isStrictCyrillicScript(s) {
  const t = cleanName(s);
  if (!t) return false;
  return /^[\s\-А-Яа-яЁё]+$/u.test(t);
}

/**
 * Prefer Cyrillic spellings that match the GeoNames ASCII name (major cities).
 * Higher score wins when sorting alternates.
 */
function asciiCyrillicBoost(asciiName, cy) {
  const o = (asciiName || "").trim().toLowerCase();
  const a = cy.toLowerCase();
  if (!o || !a) return 0;
  /** @type {[RegExp, () => boolean, number][]} */
  const tests = [
    [/^moscow$/u, () => a.includes("москв"), 100],
    [/saint.*peter|^st\.?\s*peterburg|^st peterburg/u, () => a.includes("санкт") && a.includes("петербург"), 130],
    [/saint.*peter|^st\.?\s*peterburg|^st peterburg/u, () => a.includes("петербург"), 110],
    [/saint.*peter|^st\.?\s*peterburg|^st peterburg/u, () => a.includes("ленинград"), 105],
    [/saint.*peter|^st\.?\s*peterburg|^st peterburg/u, () => a.includes("петроград"), 95],
    [/^novosibirsk$/u, () => a.includes("новосиб"), 92],
    [/yekaterinburg|ekaterinburg/u, () => a.includes("екатерин") || a.includes("ёкатерин"), 92],
    [/nizhniy novgorod|nizhny novgorod|nizhnij novgorod/u, () => a.includes("нижн") && a.includes("новгород"), 95],
    [/^kazan$/u, () => a.includes("казан"), 92],
    [/chelyabinsk/u, () => a.includes("челябин"), 92],
    [/^omsk$/u, () => a.includes("омск"), 90],
    [/^samara$/u, () => a.includes("самар"), 88],
    [/rostov-on-don|^rostov$/u, () => a.includes("ростов"), 90],
    [/^ufa$/u, () => a.includes("уф"), 96],
    [/krasnoyarsk/u, () => a.includes("краснояр"), 92],
    [/voronezh/u, () => a.includes("воронеж"), 92],
    [/volgograd/u, () => a.includes("волгоград"), 92],
    [/^perm$/u, () => a.includes("перм"), 90],
    [/krasnodar/u, () => a.includes("краснодар"), 92],
    [/saratov/u, () => a.includes("саратов"), 90],
    [/tyumen|tjumen/u, () => a.includes("тюмен"), 90],
    [/tolyatti|togliatti/u, () => a.includes("тольятт") || a.includes("тольятти"), 92],
    [/izhevsk/u, () => a.includes("ижевск"), 92],
    [/barnaul/u, () => a.includes("барнаул"), 90],
    [/ulyanovsk/u, () => a.includes("ульяновск"), 90],
    [/irkutsk/u, () => a.includes("иркутск"), 90],
    [/khabarovsk/u, () => a.includes("хабаровск"), 90],
    [/yaroslavl/u, () => a.includes("ярослав"), 90],
  ];
  let best = 0;
  for (const [re, fn, score] of tests) {
    try {
      if (re.test(o) && fn()) best = Math.max(best, score);
    } catch {
      /* noop */
    }
  }
  return best;
}

function comparePenaltyThenShorter(a, b) {
  const A = alternatePenalty(a);
  const B = alternatePenalty(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] !== B[i]) return A[i] - B[i];
  }
  if (A[3] !== B[3]) return A[3] - B[3];
  return a.localeCompare(b, "ru", { sensitivity: "base" });
}

/** Pick Russian display name: strict Cyrillic alternates + ASCII-aware boosting + pool length filter. */
function pickDisplayName(originalName, asciiName, alternatenames) {
  if (hasCyrillic(originalName)) return cleanName(originalName);
  if (!alternatenames || typeof alternatenames !== "string") return cleanName(originalName);
  const parts = alternatenames
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter(isStrictCyrillicScript)
    .map(cleanName)
    .filter((x) => x && !isBrokenName(x));
  if (parts.length === 0) return cleanName(originalName);
  const maxL = Math.max(...parts.map((s) => s.length));
  let pool = parts;
  if (maxL >= 7) {
    const relaxed = parts.filter((s) => s.length >= 6);
    if (relaxed.length) pool = relaxed;
  } else if (maxL >= 6) {
    const relaxed = parts.filter((s) => s.length >= 5);
    if (relaxed.length) pool = relaxed;
  }
  pool.sort((a, b) => {
    const boostDiff = asciiCyrillicBoost(asciiName, b) - asciiCyrillicBoost(asciiName, a);
    if (boostDiff !== 0) return boostDiff;
    const oAsc = (asciiName || "").trim().toLowerCase();
    if (/saint.*peter|^st\.?\s*peterburg|^st peterburg/u.test(oAsc)) {
      const hypA = /-/.test(a) ? 1 : 0;
      const hypB = /-/.test(b) ? 1 : 0;
      if (hypA !== hypB) return hypB - hypA;
    }
    return comparePenaltyThenShorter(a, b);
  });
  return pool[0];
}

function cleanName(name) {
  if (!name || typeof name !== "string") return "";
  let s = name.normalize("NFKC").trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
  s = s.replace(/"{2,}/g, '"');
  return s.trim();
}

function isBrokenName(s) {
  const t = cleanName(s);
  if (t.length < 2) return true;
  if (!/[А-Яа-яЁёA-Za-z]/.test(t)) return true;
  return false;
}

function normalizeDedupName(name) {
  return cleanName(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function completeness(rec) {
  let n = 0;
  if (rec.nameOriginal) n++;
  if (rec.asciiName) n++;
  if (rec.region != null) n++;
  if (rec.regionCode != null && rec.regionCode !== "") n++;
  if (rec.districtCode != null && rec.districtCode !== "") n++;
  if (rec.featureCode) n++;
  return n;
}

function betterRecord(a, b) {
  const cyA = hasCyrillic(a.name);
  const cyB = hasCyrillic(b.name);
  if (cyA !== cyB) return cyA ? a : b;
  const popA = a.population ?? 0;
  const popB = b.population ?? 0;
  if (popA !== popB) return popA >= popB ? a : b;
  const frA = featureRank(a.featureCode);
  const frB = featureRank(b.featureCode);
  if (frA !== frB) return frA < frB ? a : b;
  const cA = completeness(a);
  const cB = completeness(b);
  if (cA !== cB) return cA >= cB ? a : b;
  const idA = String(a.id);
  const idB = String(b.id);
  return idA <= idB ? a : b;
}

function parsePopulation(s) {
  const n = parseInt(String(s || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const stats = {
    totalLinesRead: 0,
    keptPopulatedPlaces: 0,
    removedInvalidCoords: 0,
    removedEmptyName: 0,
    removedNotP: 0,
    removedBadFeatureCode: 0,
    removedBrokenName: 0,
    removedNonRu: 0,
    primaryDuplicatesMerged: 0,
    secondaryDuplicatesRemoved: 0,
    finalCount: 0,
    sampleDuplicateRemovals: [],
    cyrillicFinal: 0,
    latinFinal: 0,
    sampleLatinRemaining: [],
  };

  const candidates = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    stats.totalLinesRead++;
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 15) continue;

    const geonameid = parts[0]?.trim() ?? "";
    const originalName = parts[1] ?? "";
    const asciiName = parts[2] ?? "";
    const alternatenames = parts[3] ?? "";
    const latS = parts[4];
    const lngS = parts[5];
    const featureClass = parts[6] ?? "";
    const featureCode = parts[7] ?? "";
    const country = parts[8] ?? "";
    const admin1 = parts[10]?.trim() ?? "";
    const admin2 = parts[11]?.trim() ?? "";
    const population = parsePopulation(parts[14]);

    if (country && country !== "RU") {
      stats.removedNonRu++;
      continue;
    }

    if (featureClass !== "P") {
      stats.removedNotP++;
      continue;
    }
    if (!ALLOWED_CODES.has(featureCode)) {
      stats.removedBadFeatureCode++;
      continue;
    }

    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      stats.removedInvalidCoords++;
      continue;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      stats.removedInvalidCoords++;
      continue;
    }

    if (!originalName.trim()) {
      stats.removedEmptyName++;
      continue;
    }

    const pickedRaw = pickDisplayName(originalName, asciiName, alternatenames);
    const name = cleanName(pickedRaw);
    if (isBrokenName(name)) {
      stats.removedBrokenName++;
      continue;
    }

    stats.keptPopulatedPlaces++;

    const rec = {
      id: String(geonameid),
      name,
      nameOriginal: originalName.trim(),
      asciiName: asciiName.trim(),
      region: null,
      regionCode: admin1 || null,
      districtCode: admin2 || null,
      featureCode,
      lat,
      lng,
      population,
    };

    candidates.push(rec);
  }

  /** Primary dedup: normalized name + lat/lng rounded 3 decimals */
  const primaryMap = new Map();
  for (const rec of candidates) {
    const nk = normalizeDedupName(rec.name);
    const lat3 = rec.lat.toFixed(3);
    const lng3 = rec.lng.toFixed(3);
    const key = `${nk}|${lat3}|${lng3}`;
    const existing = primaryMap.get(key);
    if (!existing) {
      primaryMap.set(key, rec);
    } else {
      stats.primaryDuplicatesMerged++;
      const winner = betterRecord(existing, rec);
      primaryMap.set(key, winner);
      const loser = winner === existing ? rec : existing;
      if (stats.sampleDuplicateRemovals.length < 20) {
        stats.sampleDuplicateRemovals.push(
          `primary key ${key}: kept ${winner.id} (${winner.name}), dropped ${loser.id} (${loser.name})`,
        );
      }
    }
  }

  const afterPrimary = [...primaryMap.values()];

  /** Secondary: same normalized name, distance < 1 km — greedy by quality (group by name to avoid O(n²)) */
  const byNormName = new Map();
  for (const rec of afterPrimary) {
    const nk = normalizeDedupName(rec.name);
    if (!byNormName.has(nk)) byNormName.set(nk, []);
    byNormName.get(nk).push(rec);
  }

  const secondary = [];
  const sortQuality = (a, b) => {
    const popA = a.population ?? 0;
    const popB = b.population ?? 0;
    if (popB !== popA) return popB - popA;
    const f = featureRank(a.featureCode) - featureRank(b.featureCode);
    if (f !== 0) return f;
    const cy = (hasCyrillic(b.name) ? 1 : 0) - (hasCyrillic(a.name) ? 1 : 0);
    if (cy !== 0) return cy;
    return completeness(b) - completeness(a);
  };

  for (const [nk, group] of byNormName) {
    if (group.length === 1) {
      secondary.push(group[0]);
      continue;
    }
    group.sort(sortQuality);
    const kept = [];
    for (const rec of group) {
      let conflict = false;
      for (const k of kept) {
        const d = haversineKm(rec.lat, rec.lng, k.lat, k.lng);
        if (d < 1) {
          conflict = true;
          stats.secondaryDuplicatesRemoved++;
          if (stats.sampleDuplicateRemovals.length < 20) {
            stats.sampleDuplicateRemovals.push(
              `secondary <1km name≈${nk}: kept ${k.id} (${k.name}), dropped ${rec.id} (${rec.name}) d=${d.toFixed(3)}km`,
            );
          }
          break;
        }
      }
      if (!conflict) kept.push(rec);
    }
    secondary.push(...kept);
  }

  /** Final sort: regionCode asc, name asc, population desc */
  function sortKeyRegion(rc) {
    if (rc == null || rc === "") return "\uffff";
    return String(rc).padStart(4, "0");
  }
  secondary.sort((a, b) => {
    const ra = sortKeyRegion(a.regionCode);
    const rb = sortKeyRegion(b.regionCode);
    if (ra !== rb) return ra.localeCompare(rb, "en");
    const na = a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    if (na !== 0) return na;
    return (b.population ?? 0) - (a.population ?? 0);
  });

  stats.finalCount = secondary.length;

  for (const rec of secondary) {
    if (hasCyrillic(rec.name)) stats.cyrillicFinal++;
    else if (hasLatin(rec.name)) {
      stats.latinFinal++;
      if (stats.sampleLatinRemaining.length < 30) stats.sampleLatinRemaining.push(rec.name);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(secondary), "utf8");

  console.log("=== Russia settlements build (GeoNames RU.txt) ===\n");
  console.log(`Total rows read:              ${stats.totalLinesRead}`);
  console.log(`Kept populated places:        ${stats.keptPopulatedPlaces}`);
  console.log(`Removed invalid coords:       ${stats.removedInvalidCoords}`);
  console.log(`Removed empty name:           ${stats.removedEmptyName}`);
  console.log(`Removed featureClass≠P:      ${stats.removedNotP}`);
  console.log(`Removed bad feature code:     ${stats.removedBadFeatureCode}`);
  console.log(`Removed broken/clean name:    ${stats.removedBrokenName}`);
  console.log(`Removed non-RU country:       ${stats.removedNonRu}`);
  console.log(`Primary duplicates merged:    ${stats.primaryDuplicatesMerged}`);
  console.log(`Secondary duplicates removed: ${stats.secondaryDuplicatesRemoved}`);
  console.log(`Final count:                  ${stats.finalCount}`);
  console.log(`Cyrillic names (final):       ${stats.cyrillicFinal}`);
  console.log(`Latin names remaining:        ${stats.latinFinal}`);
  console.log("\nSample Latin names remaining (max 30):");
  stats.sampleLatinRemaining.forEach((n) => console.log(`  - ${n}`));
  console.log("\nSample duplicate removals (max 20):");
  stats.sampleDuplicateRemovals.forEach((s) => console.log(`  ${s}`));
  console.log(`\nWrote ${OUTPUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
