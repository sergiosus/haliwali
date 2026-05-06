/**
 * GeoNames RU.txt → settlements_preview_clean.csv (clean Cyrillic names only).
 */
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidSettlementName } from "./settlementNameValidation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "app/data/raw/RU.txt");
const OUTPUT = path.join(ROOT, "app/data/settlements_preview_clean.csv");

const ALLOWED_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLX"]);

const FEATURE_RANK = {
  PPLC: 7,
  PPLA: 6,
  PPLA2: 5,
  PPLA3: 4,
  PPLA4: 3,
  PPL: 2,
  PPLX: 1,
};

const CYRILLIC_LETTER = /[А-Яа-яЁё]/;
const LATIN_LETTER = /[A-Za-z]/;
const DIGIT = /\d/;
const BRACKET_OR_SPECIAL_WRAP = /[()[\]{}«»]/;

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function featureRank(code) {
  return FEATURE_RANK[code] ?? 0;
}

function splitAlternates(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripOuterParenthesesLayers(s) {
  let t = s.trim().replace(/\s+/g, " ");
  let guard = 0;
  while (guard++ < 30) {
    const next = t.replace(/^\(+/, "").replace(/\)+$/, "").trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function stripOuterSquareLayers(s) {
  let t = s.trim();
  let guard = 0;
  while (guard++ < 30) {
    if (t.startsWith("[") && t.endsWith("]")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    if (t.startsWith("{") && t.endsWith("}")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    if (t.startsWith("«") && t.endsWith("»")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return t;
}

function removeWrappingQuotes(s) {
  let t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Normalize Ё/ё is identity — keep as-is per task. */
function cleanSelectedName(raw) {
  let s = removeWrappingQuotes(raw);
  s = stripOuterParenthesesLayers(s);
  s = stripOuterSquareLayers(s);
  s = s.replace(/\s+/g, " ").trim();
  s = stripOuterParenthesesLayers(s);
  s = stripOuterSquareLayers(s);
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Prefer primary name when it cleans to valid Cyrillic; else shortest valid cleaned token from alternatenames.
 * Does not emit Latin names (validateFinalName rejects Latin).
 */
function resolveBestNameRu(nameField, alternatenames) {
  const nameRaw = (nameField ?? "").trim();
  const nameClean = nameRaw ? cleanSelectedName(nameRaw) : "";
  if (nameClean && validateFinalName(nameClean) && CYRILLIC_LETTER.test(nameRaw)) {
    return { nameRu: nameClean, rawChosen: nameRaw };
  }

  const entries = [];
  const seenClean = new Set();
  for (const raw of splitAlternates(alternatenames)) {
    if (!raw) continue;
    const cleaned = cleanSelectedName(raw);
    if (!validateFinalName(cleaned)) continue;
    if (seenClean.has(cleaned)) continue;
    seenClean.add(cleaned);
    entries.push({ cleaned, raw, len: cleaned.length });
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.len - b.len || a.cleaned.localeCompare(b.cleaned, "ru"));
  return { nameRu: entries[0].cleaned, rawChosen: entries[0].raw };
}

function validateFinalName(nameRu) {
  const t = nameRu.trim();
  if (!CYRILLIC_LETTER.test(t)) return false;
  if (LATIN_LETTER.test(t)) return false;
  if (DIGIT.test(t)) return false;
  if (!isValidSettlementName(t)) return false;
  return true;
}

function normalizeNameKey(nameRu) {
  return nameRu.trim().replace(/\s+/g, " ").toLowerCase();
}

function csvEscape(s) {
  const x = String(s ?? "");
  if (/[",\n\r]/.test(x)) return `"${x.replace(/"/g, '""')}"`;
  return x;
}

function compareRowsForKeep(a, b) {
  const popA = a.population;
  const popB = b.population;
  if (popA !== popB) return popB - popA;
  const rA = featureRank(a.featureCode);
  const rB = featureRank(b.featureCode);
  if (rA !== rB) return rB - rA;
  const dA = (a.districtCode ?? "").trim() ? 1 : 0;
  const dB = (b.districtCode ?? "").trim() ? 1 : 0;
  if (dA !== dB) return dB - dA;
  return a.geonameid - b.geonameid;
}

async function main() {
  let totalRead = 0;
  let keptBeforeDedupe = 0;
  let skippedNoCyrillic = 0;
  const skippedLatinExamples = [];
  const cleanedBracketExamples = [];

  const rows = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRead++;
    const cols = line.split("\t");
    if (cols.length < 15) continue;

    const geonameid = Number(cols[0]);
    const name = cols[1] ?? "";
    const alternatenames = cols[3] ?? "";
    const lat = parseFloat(cols[4]);
    const lng = parseFloat(cols[5]);
    const featureClass = cols[6];
    const featureCode = cols[7];
    const regionCode = (cols[10] ?? "").trim();
    const districtCode = (cols[11] ?? "").trim();
    const population = Number.parseInt(String(cols[14] ?? "0"), 10) || 0;

    if (featureClass !== "P" || !ALLOWED_CODES.has(featureCode)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const resolved = resolveBestNameRu(name, alternatenames);

    if (!resolved) {
      skippedNoCyrillic++;
      const nm = String(name).trim();
      const latinMain = LATIN_LETTER.test(nm) && !CYRILLIC_LETTER.test(nm);
      if (skippedLatinExamples.length < 30 && nm && latinMain) {
        skippedLatinExamples.push(nm);
      }
      continue;
    }

    const { nameRu: cleaned, rawChosen } = resolved;

    if (BRACKET_OR_SPECIAL_WRAP.test(rawChosen) && cleanedBracketExamples.length < 30) {
      cleanedBracketExamples.push({ from: rawChosen, to: cleaned });
    }

    keptBeforeDedupe++;
    rows.push({
      geonameid: Number.isFinite(geonameid) ? geonameid : 0,
      nameRu: cleaned,
      lat,
      lng,
      regionCode,
      districtCode,
      featureCode,
      population,
    });
  }

  /** Partition by normalized name + region, dedupe within 1 km. */
  const byKey = new Map();
  for (const r of rows) {
    const k = `${normalizeNameKey(r.nameRu)}|${r.regionCode}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }

  let duplicatesRemoved = 0;
  const finalRows = [];

  for (const [, group] of byKey) {
    group.sort(compareRowsForKeep);
    const kept = [];
    for (const r of group) {
      let dup = false;
      for (const k of kept) {
        const d = calculateDistanceKm(r.lat, r.lng, k.lat, k.lng);
        if (d < 1) {
          dup = true;
          duplicatesRemoved++;
          break;
        }
      }
      if (!dup) kept.push(r);
    }
    finalRows.push(...kept);
  }

  finalRows.sort((a, b) => a.nameRu.localeCompare(b.nameRu, "ru"));

  const header =
    "name_ru,lat,lng,region_code,district_code,feature_code,population";
  const lines = [
    header,
    ...finalRows.map((r) =>
      [
        csvEscape(r.nameRu),
        r.lat,
        r.lng,
        csvEscape(r.regionCode),
        csvEscape(r.districtCode),
        csvEscape(r.featureCode),
        r.population,
      ].join(","),
    ),
  ];

  fs.writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

  console.log("--- Validation report ---");
  console.log("total rows read:", totalRead);
  console.log("kept rows (before dedupe):", keptBeforeDedupe);
  console.log("skipped (no clean Cyrillic candidate):", skippedNoCyrillic);
  console.log("duplicates removed (<1km same name+region):", duplicatesRemoved);
  console.log("final count:", finalRows.length);
  console.log("\nExamples skipped Latin primary name (max 30):");
  console.log(skippedLatinExamples.join(", ") || "(none collected)");
  console.log("\nExamples cleaned bracket names (max 30):");
  for (const ex of cleanedBracketExamples) {
    console.log(`  ${JSON.stringify(ex.from)} → ${JSON.stringify(ex.to)}`);
  }

  /** Hard validation on final rows (same rules as write). */
  const failures = [];
  for (const r of finalRows) {
    const nameRu = r.nameRu;
    if (!validateFinalName(nameRu)) failures.push({ nameRu, reason: "validateFinalName" });
    else if (LATIN_LETTER.test(nameRu)) failures.push({ nameRu, reason: "latin" });
    else if (/[()[\]{}«»]/.test(nameRu)) failures.push({ nameRu, reason: "bracket" });
    else if (!String(nameRu).trim()) failures.push({ nameRu, reason: "empty" });
  }

  if (failures.length) {
    console.error("\n!!! HARD VALIDATION FAILED !!!");
    console.error("failures:", failures.slice(0, 40));
    process.exit(1);
  }

  console.log("\nHard validation: OK (no Latin, no brackets, no empty names).");
  console.log("Wrote", finalRows.length, "rows to", path.relative(ROOT, OUTPUT));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
