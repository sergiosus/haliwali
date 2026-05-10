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

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const BLOCKS_PATH = path.join(process.cwd(), ".data", "admin-user-blocks.json");

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

let imported = 0;
let skipped = 0;
let errors = 0;

try {
  if (!fs.existsSync(BLOCKS_PATH)) {
    console.log({ imported, skipped, errors, note: "no_json_file", path: BLOCKS_PATH });
    process.exit(0);
  }

  let raw = "";
  try {
    raw = fs.readFileSync(BLOCKS_PATH, "utf8");
  } catch {
    console.log({ imported, skipped, errors: errors + 1, note: "read_failed", path: BLOCKS_PATH });
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log({ imported, skipped, errors: errors + 1, note: "bad_json", path: BLOCKS_PATH });
    process.exit(1);
  }

  if (!parsed || typeof parsed !== "object") {
    console.log({ imported, skipped: skipped + 1, errors, note: "not_object", path: BLOCKS_PATH });
    process.exit(0);
  }

  const entries = Object.entries(parsed);
  for (const [userIdRaw, entry] of entries) {
    const userId = String(userIdRaw ?? "").trim();
    if (!userId) {
      skipped++;
      continue;
    }
    const blockedAt =
      entry && typeof entry === "object" && typeof entry.blockedAt === "number" ? entry.blockedAt : 0;
    const ts = Number(blockedAt);
    if (!Number.isFinite(ts) || ts <= 0) {
      skipped++;
      continue;
    }
    try {
      await pool.query(
        `INSERT INTO moderation_user_blocks (user_id, reason, blocked_by, created_at)
         VALUES ($1, NULL, NULL, to_timestamp($2 / 1000.0))
         ON CONFLICT (user_id) DO UPDATE SET created_at = EXCLUDED.created_at`,
        [userId, ts],
      );
      imported++;
    } catch {
      errors++;
    }
  }

  console.log({ imported, skipped, errors, path: BLOCKS_PATH });
} finally {
  await pool.end().catch(() => void 0);
}

