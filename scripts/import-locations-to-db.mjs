import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pgPkg from "pg";
const { Pool } = pgPkg;

// This script runs under Node, so we inline the minimal helpers we need.
// (Avoids relying on TS module resolution at runtime.)

function collapseKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

// Keep in sync with app/lib/russiaRegionCanonical.ts (subset needed for imports).
const REGION_TO_CANONICAL = {
  удмуртия: "Удмуртская Республика",
  "республика удмуртия": "Удмуртская Республика",
  "удмуртская республика": "Удмуртская Республика",
  татарстан: "Республика Татарстан",
  "республика татарстан": "Республика Татарстан",
  "марий эл": "Республика Марий Эл",
  "республика марий эл": "Республика Марий Эл",
  саха: "Республика Саха (Якутия)",
  якутия: "Республика Саха (Якутия)",
  "республика саха (якутия)": "Республика Саха (Якутия)",
  "еврейская автономная область": "Еврейская автономная область",
  еврейская: "Еврейская автономная область",
  москва: "г. Москва",
  "г москва": "г. Москва",
  "санкт-петербург": "г. Санкт-Петербург",
  "г санкт-петербург": "г. Санкт-Петербург",
  спб: "г. Санкт-Петербург",
};

function canonicalRussiaRegionLabel(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return t;
  const key = collapseKey(t);
  return REGION_TO_CANONICAL[key] ?? t;
}

const CYR_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function slugify(input) {
  const s = String(input ?? "").trim().toLowerCase();
  let out = "";
  for (const ch of Array.from(s)) {
    const m = CYR_MAP[ch];
    if (m !== undefined) out += m;
    else if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
    else out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").replace(/[^\w-]/g, "");
}

function isMacroRegionLabel(name) {
  const n = String(name ?? "").toLowerCase();
  return n.includes("федеральный округ") || n.includes("федеральная территория");
}
function looksLikeDistrictAdministrativeLabel(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes(" район") ||
    /^район\b/u.test(n) ||
    n.includes(" городской округ") ||
    n.includes(" муниципальный округ") ||
    n.includes(" административный округ") ||
    n.includes(" сельсовет") ||
    n.includes(" с/с") ||
    n.includes(" сельское поселение") ||
    n.includes(" городское поселение")
  );
}
function looksLikeRuralAutoSettlement(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  const markers = [
    "деревня",
    "село",
    "поселок",
    "посёлок",
    "хутор",
    "аул",
    "станица",
    "сельсовет",
    "район",
    "область",
    "республика",
    "горы",
    "море",
    "река",
  ];
  return markers.some((m) => n.includes(m));
}
function isValidDetectedSettlement(name) {
  const t = String(name ?? "").trim();
  if (!t) return false;
  if (isMacroRegionLabel(t)) return false;
  if (/\d/.test(t)) return false;
  if (looksLikeDistrictAdministrativeLabel(t)) return false;
  if (looksLikeRuralAutoSettlement(t)) return false;
  const low = t.toLowerCase();
  if (
    low.includes("республика") ||
    low.includes("область") ||
    low.includes("край") ||
    low.includes("район") ||
    low.includes("округ") ||
    low.includes("сельсовет") ||
    low.includes("поселение")
  ) {
    return false;
  }
  return true;
}

function mustEnv(name) {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (!k) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadEnvFilesIfNeeded() {
  if ((process.env.DATABASE_URL ?? "").trim()) return;
  const root = projectRoot();
  const candidates = [".env.local", ".env.production", ".env"];
  for (const f of candidates) {
    const p = path.join(root, f);
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = parseDotenv(fs.readFileSync(p, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k]) process.env[k] = String(v ?? "");
      }
    } catch {
      // ignore
    }
  }
}

function normalizeNameForSearch(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

function isAllowedSettlementName(name) {
  const t = String(name ?? "").trim();
  if (!t) return false;
  if (!isValidDetectedSettlement(t)) return false;
  if (looksLikeDistrictAdministrativeLabel(t)) return false;
  if (looksLikeRuralAutoSettlement(t)) return false;
  return true;
}

function projectRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function parseSubjectsByDistrictFromTs() {
  const p = path.join(projectRoot(), "app", "lib", "russiaFederalDistricts.ts");
  const src = fs.readFileSync(p, "utf8");
  const objStart = src.indexOf("export const SUBJECTS_BY_DISTRICT");
  if (objStart < 0) throw new Error("SUBJECTS_BY_DISTRICT not found in russiaFederalDistricts.ts");
  const braceStart = src.indexOf("{", objStart);
  if (braceStart < 0) throw new Error("SUBJECTS_BY_DISTRICT { not found");
  const braceEnd = src.indexOf("};", braceStart);
  if (braceEnd < 0) throw new Error("SUBJECTS_BY_DISTRICT end not found");
  const block = src.slice(braceStart, braceEnd + 1);

  const out = {};
  // Match `"District": [ ... ]` blocks and pull all "..." strings inside.
  const districtRe = /"([^"]+)"\s*:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = districtRe.exec(block))) {
    const district = m[1];
    const body = m[2] ?? "";
    const items = [];
    const itemRe = /"([^"]+)"/g;
    let mi;
    while ((mi = itemRe.exec(body))) {
      items.push(mi[1]);
    }
    out[district] = items;
  }

  const districts = Object.keys(out);
  if (districts.length < 5) throw new Error("Failed to parse districts from TS file");
  return out;
}

function loadSettlementsJson() {
  const p = path.join(projectRoot(), "app", "data", "settlements_ru.json");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("settlements_ru.json is not an array");
  return parsed;
}

function extractCitySeedsFromCitiesTs() {
  const p = path.join(projectRoot(), "app", "lib", "cities.ts");
  const src = fs.readFileSync(p, "utf8");
  const out = [];
  const re =
    /\{\s*name:\s*"([^"]+)"\s*,\s*region:\s*"([^"]+)"\s*,\s*lat:\s*([0-9.\-]+)\s*,\s*lng:\s*([0-9.\-]+)\s*\}/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({
      city: m[1],
      region: m[2],
      lat: Number(m[3]),
      lng: Number(m[4]),
    });
  }
  return out;
}

function extractStaticRfCitiesFromStaticRussiaCitiesTs() {
  const p = path.join(projectRoot(), "app", "lib", "staticRussiaCities.ts");
  const src = fs.readFileSync(p, "utf8");
  const start = src.indexOf("export const STATIC_RF_CITIES");
  if (start < 0) throw new Error("STATIC_RF_CITIES not found in staticRussiaCities.ts");
  const bracketStart = src.indexOf("[", start);
  const bracketEnd = src.indexOf("];", bracketStart);
  if (bracketStart < 0 || bracketEnd < 0) throw new Error("STATIC_RF_CITIES block not found");
  const block = src.slice(bracketStart, bracketEnd + 1);

  const out = [];
  const re =
    /\{\s*city:\s*"([^"]+)"[\s\S]*?region:\s*"([^"]+)"[\s\S]*?coords:\s*\{\s*lat:\s*([0-9.\-]+)\s*,\s*lng:\s*([0-9.\-]+)\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    out.push({
      city: m[1],
      region: m[2],
      lat: Number(m[3]),
      lng: Number(m[4]),
    });
  }
  return out;
}

function buildCanonicalCitySeedRows(validSubjectSlugSet) {
  const sources = [
    ...extractCitySeedsFromCitiesTs(),
    ...extractStaticRfCitiesFromStaticRussiaCitiesTs(),
    // Ensure a minimal set even if TS sources change.
    { city: "Йошкар-Ола", region: "Республика Марий Эл", lat: 56.63877, lng: 47.89078 },
    { city: "Благовешенск", region: "Амурская область", lat: 50.27593, lng: 127.52637 },
  ];

  const dedupe = new Set();
  const out = [];
  for (const s of sources) {
    const name = String(s?.city ?? "").trim();
    const region = canonicalRussiaRegionLabel(String(s?.region ?? "")).trim();
    const lat = Number(s?.lat);
    const lng = Number(s?.lng);
    if (!name || !region || !Number.isFinite(lat + lng)) continue;

    const subject_slug = slugify(region);
    if (!subject_slug || !validSubjectSlugSet.has(subject_slug)) continue;
    const normalized_name = normalizeNameForSearch(name);
    if (!normalized_name) continue;

    const key = `${subject_slug}\0${normalized_name}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    out.push({
      subject_slug,
      name,
      normalized_name,
      lat,
      lng,
      settlement_type: "city",
    });
  }
  return out;
}

function buildSubjectRows() {
  const SUBJECTS_BY_DISTRICT = parseSubjectsByDistrictFromTs();
  const out = [];
  for (const [district, subjects] of Object.entries(SUBJECTS_BY_DISTRICT)) {
    for (const s of subjects) {
      const name = canonicalRussiaRegionLabel(String(s ?? "")).trim();
      if (!name) continue;
      const slug = slugify(name);
      if (!slug) continue;
      out.push({ slug, name, federal_district: district });
    }
  }
  // Dedup by slug (should already be unique).
  const seen = new Set();
  const uniq = [];
  for (const r of out) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    uniq.push(r);
  }
  return uniq;
}

async function insertSubjects(pool, subjects) {
  for (const s of subjects) {
    await pool.query(
      `INSERT INTO location_subjects (slug, name, federal_district)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, federal_district = EXCLUDED.federal_district`,
      [s.slug, s.name, s.federal_district],
    );
  }
}

async function insertSettlements(pool, rows) {
  // Chunked multi-values insert.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(r.subject_slug, r.name, r.normalized_name, r.lat, r.lng, r.settlement_type);
    }
    const sql = `
      INSERT INTO location_settlements (subject_slug, name, normalized_name, lat, lng, settlement_type)
      VALUES ${values.join(",")}
      ON CONFLICT (subject_slug, normalized_name) DO UPDATE
        SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, settlement_type = EXCLUDED.settlement_type
    `;
    await pool.query(sql, params);
    inserted += chunk.length;
    if (inserted % 5000 === 0) {
      // eslint-disable-next-line no-console
      console.log(`... upserted ${inserted}/${rows.length}`);
    }
  }
}

function mainFilterAndNormalize(settlements, validSubjectSlugSet) {
  const dedupe = new Set();
  const out = [];
  let skippedBadName = 0;
  let skippedNoSubject = 0;
  let skippedNoCoords = 0;
  for (const row of settlements) {
    const name = String(row?.name ?? "").trim();
    if (!isAllowedSettlementName(name)) {
      skippedBadName++;
      continue;
    }
    const regionRaw = String(row?.region ?? "").trim();
    const region = canonicalRussiaRegionLabel(regionRaw).trim();
    if (!region) {
      skippedNoSubject++;
      continue;
    }
    const subject_slug = slugify(region);
    if (!subject_slug || !validSubjectSlugSet.has(subject_slug)) {
      // Only import settlements that map to our official subjects list.
      skippedNoSubject++;
      continue;
    }
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    const hasCoords = Number.isFinite(lat + lng);
    const normalized_name = normalizeNameForSearch(name);
    if (!normalized_name) {
      skippedBadName++;
      continue;
    }
    const key = `${subject_slug}\0${normalized_name}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    if (!hasCoords) skippedNoCoords++;
    out.push({
      subject_slug,
      name,
      normalized_name,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      settlement_type: "settlement",
    });
  }
  return { out, skippedBadName, skippedNoSubject, skippedNoCoords };
}

loadEnvFilesIfNeeded();
const DATABASE_URL = mustEnv("DATABASE_URL");
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  // Ensure tables exist by applying the migration SQL if needed.
  const reg = await pool.query(
    "select to_regclass('public.location_subjects') as subjects, to_regclass('public.location_settlements') as settlements",
  );
  const hasSubjects = Boolean(reg.rows?.[0]?.subjects);
  const hasSettlements = Boolean(reg.rows?.[0]?.settlements);
  if (!hasSubjects || !hasSettlements) {
    const migrationPath = path.join(projectRoot(), "db", "migrations", "20260506_locations_reference_data.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    // eslint-disable-next-line no-console
    console.log("Applying migration:", migrationPath);
    await pool.query(sql);
  }

  const subjects = buildSubjectRows();
  // eslint-disable-next-line no-console
  console.log(`subjects: ${subjects.length}`);
  await insertSubjects(pool, subjects);

  const validSubjectSlugSet = new Set(subjects.map((s) => s.slug));
  const settlements = loadSettlementsJson();
  // eslint-disable-next-line no-console
  console.log(`raw settlements rows: ${settlements.length}`);

  const { out, skippedBadName, skippedNoSubject, skippedNoCoords } = mainFilterAndNormalize(
    settlements,
    validSubjectSlugSet,
  );
  // eslint-disable-next-line no-console
  console.log(`import rows (deduped): ${out.length}`);
  // eslint-disable-next-line no-console
  console.log({ skippedBadName, skippedNoSubject, skippedNoCoords });

  await insertSettlements(pool, out);

  const citySeeds = buildCanonicalCitySeedRows(validSubjectSlugSet);
  // eslint-disable-next-line no-console
  console.log(`canonical city seeds: ${citySeeds.length}`);
  await insertSettlements(pool, citySeeds);

  const r1 = await pool.query("SELECT count(*)::int AS n FROM location_subjects");
  const r2 = await pool.query("SELECT count(*)::int AS n FROM location_settlements");
  // eslint-disable-next-line no-console
  console.log(`DB counts: subjects=${r1.rows[0]?.n} settlements=${r2.rows[0]?.n}`);
} finally {
  await pool.end().catch(() => void 0);
}

