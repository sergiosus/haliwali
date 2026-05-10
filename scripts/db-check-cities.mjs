import fs from "node:fs";
import path from "node:path";
import pgPkg from "pg";

const { Pool } = pgPkg;

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function loadEnvIfNeeded() {
  if ((process.env.DATABASE_URL ?? "").trim()) return;
  const root = process.cwd();
  for (const f of [".env.local", ".env.production", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const parsed = parseDotenv(fs.readFileSync(p, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = String(v ?? "");
    }
  }
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
try {
  const reg = await pool.query(
    "select to_regclass('public.location_subjects') as subjects, to_regclass('public.location_settlements') as settlements",
  );
  const counts = await pool.query(
    "select (select count(*)::int from location_subjects) as subjects, (select count(*)::int from location_settlements) as settlements",
  );

  const izh = await pool.query(
    "select name, subject_slug, settlement_type from location_settlements where normalized_name like 'ижевск%' order by subject_slug, name limit 50",
  );

  const izhAny = await pool.query(
    "select name, subject_slug, settlement_type, normalized_name from location_settlements where normalized_name like 'иж%' order by normalized_name, subject_slug, name limit 30",
  );

  console.log({
    tables: reg.rows?.[0],
    counts: counts.rows?.[0],
    izhevsk_prefix: izh.rows,
    izh_sample: izhAny.rows,
  });
} finally {
  await pool.end().catch(() => void 0);
}

