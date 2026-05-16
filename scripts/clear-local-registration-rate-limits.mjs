/**
 * Local development only: clear registration-related rate limits.
 * Does nothing when NODE_ENV=production.
 *
 * Usage: node scripts/clear-local-registration-rate-limits.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pgPkg from "pg";

const { Pool } = pgPkg;

const DATA_DIR = path.join(process.cwd(), ".data");
const JSON_FILES = [
  "registration-ip-rate.json",
  "code-ip-rate.json",
  "registration-rate.json",
  "sms-rate.json",
];

const PG_SCOPES = [
  "file:registration-ip-rate.json",
  "file:code-ip-rate.json",
  "registration_identifier",
];

function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

for (const f of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  const parsed = parseDotenv(fs.readFileSync(p, "utf8"));
  if (!process.env.DATABASE_URL && parsed.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run in production.");
  process.exit(1);
}

const clearedJson = [];
for (const name of JSON_FILES) {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) continue;
  fs.writeFileSync(p, "{}\n", "utf8");
  clearedJson.push(p);
}

const url = (process.env.DATABASE_URL ?? "").trim();
let pgDeleted = 0;
if (url) {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const res = await pool.query(
      `DELETE FROM abuse_rate_limits WHERE scope = ANY($1::text[])`,
      [PG_SCOPES],
    );
    pgDeleted = res.rowCount ?? 0;
  } finally {
    await pool.end();
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: url ? "postgres+optional-json" : "json-only",
      clearedJson,
      postgresAbuseRateLimitsDeleted: pgDeleted,
      scopes: PG_SCOPES,
      note: 'Message "Слишком много регистраций" uses scope file:registration-ip-rate.json (limit 3 / 10 min per IP).',
    },
    null,
    2,
  ),
);
