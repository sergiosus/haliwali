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

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const SESSIONS_PATH = path.join(DATA_DIR, "admin-sessions.json");
const RATE_PATH = path.join(DATA_DIR, "admin-login-rate.json");

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

let importedSessions = 0;
let skippedSessions = 0;
let sessionErrors = 0;

let importedRates = 0;
let skippedRates = 0;
let rateErrors = 0;

function safeJsonRead(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

try {
  const now = Date.now();

  const sessions = safeJsonRead(SESSIONS_PATH);
  if (sessions && typeof sessions === "object") {
    for (const [tokenRaw, rec] of Object.entries(sessions)) {
      const token = String(tokenRaw ?? "").trim();
      if (!token) {
        skippedSessions++;
        continue;
      }
      const createdAt = rec && typeof rec === "object" && typeof rec.createdAt === "number" ? rec.createdAt : 0;
      const expiresAt = rec && typeof rec === "object" && typeof rec.expiresAt === "number" ? rec.expiresAt : 0;
      const c = Number(createdAt);
      const e = Number(expiresAt);
      if (!Number.isFinite(e) || e <= now) {
        // Current code treats these as expired.
        skippedSessions++;
        continue;
      }
      const created = Number.isFinite(c) && c > 0 ? c : Math.max(0, e - TTL_MS);
      try {
        await pool.query(
          `INSERT INTO admin_sessions (token, admin_id, created_at, expires_at)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))
           ON CONFLICT (token) DO UPDATE SET
             admin_id = EXCLUDED.admin_id,
             created_at = EXCLUDED.created_at,
             expires_at = EXCLUDED.expires_at`,
          [token, "admin_password", created, e],
        );
        importedSessions++;
      } catch {
        sessionErrors++;
      }
    }
  }

  const rate = safeJsonRead(RATE_PATH);
  if (rate && typeof rate === "object") {
    for (const [keyRaw, arr] of Object.entries(rate)) {
      const key = String(keyRaw ?? "").trim();
      if (!key || !Array.isArray(arr)) {
        skippedRates++;
        continue;
      }
      const recent = arr
        .map((x) => Number(x))
        .filter((ts) => Number.isFinite(ts) && ts > 0 && now - ts < RATE_WINDOW_MS)
        .sort((a, b) => a - b);
      if (recent.length === 0) {
        skippedRates++;
        continue;
      }
      const attempts = recent.length;
      const firstAttemptAt = recent[0];
      const lastAttemptAt = recent[recent.length - 1];
      const blockedUntil = attempts > RATE_MAX ? firstAttemptAt + RATE_WINDOW_MS : null;
      try {
        await pool.query(
          `INSERT INTO admin_login_rate_limits (key, attempts, first_attempt_at, last_attempt_at, blocked_until)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5)
           ON CONFLICT (key) DO UPDATE SET
             attempts = EXCLUDED.attempts,
             first_attempt_at = EXCLUDED.first_attempt_at,
             last_attempt_at = EXCLUDED.last_attempt_at,
             blocked_until = EXCLUDED.blocked_until`,
          [key, attempts, firstAttemptAt, lastAttemptAt, blockedUntil != null ? new Date(blockedUntil) : null],
        );
        importedRates++;
      } catch {
        rateErrors++;
      }
    }
  }

  console.log({
    sessions: { imported: importedSessions, skipped: skippedSessions, errors: sessionErrors },
    rateLimits: { imported: importedRates, skipped: skippedRates, errors: rateErrors },
  });
} finally {
  await pool.end().catch(() => void 0);
}

