import fs from "node:fs";
import path from "node:path";
import pgPkg from "pg";

const { Pool } = pgPkg;

const CITY_SPLIT_RE = /(?:\r?\n|[,;•·]+|\s+[–—-]\s+|\.\s+)/g;

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

function loadEnvIfNeeded() {
  if ((process.env.DATABASE_URL ?? "").trim()) return;
  const root = process.cwd();
  for (const f of [".env.local", ".env.production", ".env"]) {
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

function cleanCityToken(raw) {
  return String(raw ?? "")
    .replace(/\b(?:работает|доставка|выезд|также|города|город|г)\.?\b/gi, " ")
    .replace(/^[\s:()[\]{}"“”«»'`]+|[\s:()[\]{}"“”«»'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCatalogCityList(raw) {
  if (!String(raw ?? "").trim()) return [];
  return String(raw)
    .split(CITY_SPLIT_RE)
    .map(cleanCityToken)
    .filter((city) => city.length >= 2 && city.length <= 80)
    .filter((city) => !/^\d+$/.test(city));
}

function cityKey(city) {
  return cleanCityToken(city).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function dedupeCatalogCities(cities) {
  const out = [];
  const seen = new Set();
  for (const raw of cities) {
    const city = cleanCityToken(raw);
    const key = cityKey(city);
    if (!city || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

function normalizeCatalogCompanyCities(city, serviceCities = []) {
  const cityParts = splitCatalogCityList(city);
  const primaryCity = cityParts[0] || cleanCityToken(city);
  const primaryKey = cityKey(primaryCity);
  const service = dedupeCatalogCities([
    ...cityParts.slice(primaryCity ? 1 : 0),
    ...serviceCities.flatMap(splitCatalogCityList),
  ]).filter((c) => cityKey(c) !== primaryKey);
  return { primaryCity, serviceCities: service };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

if (dryRun === apply) {
  console.error("Use exactly one mode: --dry-run or --apply");
  process.exit(2);
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  const table = await pool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'catalog_companies'
    `,
  );
  if ((table.rowCount ?? 0) === 0) {
    console.error("catalog_companies table is missing. Apply catalog migrations before running this repair.");
    process.exitCode = 1;
    await pool.end();
    process.exit();
  }

  if (apply) {
    await pool.query(`
      ALTER TABLE catalog_companies
        ADD COLUMN IF NOT EXISTS service_cities JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  const col = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'catalog_companies' AND column_name = 'service_cities'
    `,
  );
  const hasServiceCities = (col.rowCount ?? 0) > 0;
  if (!hasServiceCities && dryRun) {
    console.warn("service_cities column is missing; dry-run will treat it as empty. Apply migration before --apply.");
  }

  const { rows } = await pool.query(`
    SELECT id, name, city${hasServiceCities ? ", service_cities" : ""}
    FROM catalog_companies
    ORDER BY id ASC
  `);

  let changed = 0;
  for (const row of rows) {
    const currentServiceCities = Array.isArray(row.service_cities) ? row.service_cities : [];
    const normalized = normalizeCatalogCompanyCities(row.city ?? "", currentServiceCities);
    const oldCity = String(row.city ?? "");
    const cityChanged = normalized.primaryCity !== oldCity;
    const serviceChanged = !arraysEqual(normalized.serviceCities, currentServiceCities.map(String));
    if (!cityChanged && !serviceChanged) continue;

    changed += 1;
    console.log(
      [
        `company id=${row.id}`,
        `name="${String(row.name ?? "").slice(0, 80)}"`,
        `oldCity="${oldCity.slice(0, 160)}"`,
        `newPrimaryCity="${normalized.primaryCity}"`,
        `serviceCities=${normalized.serviceCities.length}`,
      ].join(" | "),
    );

    if (apply) {
      await pool.query(
        `
        UPDATE catalog_companies
        SET city = $2, service_cities = $3::jsonb, updated_at = NOW()
        WHERE id = $1
        `,
        [row.id, normalized.primaryCity, JSON.stringify(normalized.serviceCities)],
      );
    }
  }

  console.log(`${dryRun ? "Dry-run" : "Applied"} complete. Changed rows: ${changed}`);
} finally {
  await pool.end();
}
