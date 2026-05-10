import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pgPkg from "pg";

const { Pool } = pgPkg;

function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\\r?\\n/)) {
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

function safeJsonRead(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function derivePurposeFromPath(p, type) {
  const norm = String(p ?? "").replaceAll("\\\\", "/");
  const base = norm.split("/").pop() || norm || "unknown";
  return `${String(base).toLowerCase()}:${String(type ?? "").toLowerCase()}`;
}

function deriveScopeFromPath(p) {
  const norm = String(p ?? "").replaceAll("\\\\", "/");
  const base = norm.split("/").pop() || norm || "unknown";
  return `file:${String(base).toLowerCase()}`;
}

function sha256(input) {
  return createHash("sha256").update(String(input ?? "")).digest("hex");
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const SMS_CODES_PATH = path.join(DATA_DIR, "sms-codes.json");
const SMS_RATE_PATH = path.join(DATA_DIR, "sms-rate.json");
const REG_IP_RATE_PATH = path.join(DATA_DIR, "registration-ip-rate.json");
const CODE_IP_RATE_PATH = path.join(DATA_DIR, "code-ip-rate.json");
const REG_IDENTIFIER_RATE_PATH = path.join(DATA_DIR, "registration-rate.json");
const ABUSE_LOG_PATH = path.join(DATA_DIR, "suspicious-activity.log.jsonl");

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

let importedCodes = 0;
let skippedCodes = 0;
let codeErrors = 0;

let importedSmsRates = 0;
let skippedSmsRates = 0;
let smsRateErrors = 0;

let importedAbuseRates = 0;
let skippedAbuseRates = 0;
let abuseRateErrors = 0;

let importedEvents = 0;
let skippedEvents = 0;
let eventErrors = 0;

try {
  const now = Date.now();

  // 1) sms_codes (from sms-codes.json array)
  const codes = safeJsonRead(SMS_CODES_PATH);
  if (Array.isArray(codes)) {
    for (const rec of codes) {
      try {
        if (!rec || typeof rec !== "object") {
          skippedCodes++;
          continue;
        }
        const value = typeof rec.value === "string" ? rec.value.trim() : "";
        const type = typeof rec.type === "string" ? rec.type.trim() : "";
        const codeHash = typeof rec.codeHash === "string" ? rec.codeHash.trim() : "";
        const expiresAt = typeof rec.expiresAt === "number" ? Number(rec.expiresAt) : 0;
        const createdAt = typeof rec.createdAt === "number" ? Number(rec.createdAt) : 0;
        const attempts = typeof rec.attempts === "number" ? Math.max(0, Math.floor(Number(rec.attempts))) : 0;
        const consumed = Boolean(rec.consumed);

        if (!value || (type !== "phone" && type !== "email") || !codeHash || !Number.isFinite(expiresAt) || expiresAt <= now) {
          skippedCodes++;
          continue;
        }
        if (consumed) {
          skippedCodes++;
          continue;
        }
        const purpose = derivePurposeFromPath(SMS_CODES_PATH, type);
        const key = `legacy-${sha256(`${purpose}:${value}:${createdAt || expiresAt}:${codeHash}`).slice(0, 24)}`;

        await pool.query(
          `INSERT INTO sms_codes (key, code_hash, purpose, target, created_at, expires_at, attempts)
           VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7)
           ON CONFLICT (key) DO UPDATE SET
             code_hash = EXCLUDED.code_hash,
             purpose = EXCLUDED.purpose,
             target = EXCLUDED.target,
             created_at = EXCLUDED.created_at,
             expires_at = EXCLUDED.expires_at,
             attempts = EXCLUDED.attempts`,
          [key, codeHash, purpose, value, createdAt > 0 ? createdAt : Math.max(0, expiresAt - 60_000), expiresAt, attempts],
        );
        importedCodes++;
      } catch {
        codeErrors++;
      }
    }
  }

  // 2) sms_rate_limits (from sms-rate.json: { [value]: number[] })
  const smsRate = safeJsonRead(SMS_RATE_PATH);
  if (smsRate && typeof smsRate === "object") {
    for (const [valueRaw, arr] of Object.entries(smsRate)) {
      try {
        const value = String(valueRaw ?? "").trim();
        if (!value || !Array.isArray(arr)) {
          skippedSmsRates++;
          continue;
        }
        const ts = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
        if (ts.length === 0) {
          skippedSmsRates++;
          continue;
        }
        const first = ts[0];
        const last = ts[ts.length - 1];
        // Legacy file store uses value-only key; serverSms now scopes by `sms-codes.json:phone` etc.
        // We import as phone by default (this file is phone-only in current routes).
        const key = `${derivePurposeFromPath(SMS_CODES_PATH, "phone")}:${value}`;
        await pool.query(
          `INSERT INTO sms_rate_limits (key, attempts, first_attempt_at, last_attempt_at, blocked_until)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), NULL)
           ON CONFLICT (key) DO UPDATE SET
             attempts = EXCLUDED.attempts,
             first_attempt_at = EXCLUDED.first_attempt_at,
             last_attempt_at = EXCLUDED.last_attempt_at,
             blocked_until = NULL`,
          [key, ts.length, first, last],
        );
        importedSmsRates++;
      } catch {
        smsRateErrors++;
      }
    }
  }

  // 3) abuse_rate_limits (IP maps + registration identifier map)
  for (const p of [REG_IP_RATE_PATH, CODE_IP_RATE_PATH, REG_IDENTIFIER_RATE_PATH]) {
    const scope = p === REG_IDENTIFIER_RATE_PATH ? "registration_identifier" : deriveScopeFromPath(p);
    const map = safeJsonRead(p);
    if (!map || typeof map !== "object") continue;
    for (const [kRaw, arr] of Object.entries(map)) {
      try {
        const keyPart = String(kRaw ?? "").trim();
        if (!keyPart || !Array.isArray(arr)) {
          skippedAbuseRates++;
          continue;
        }
        const ts = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
        if (ts.length === 0) {
          skippedAbuseRates++;
          continue;
        }
        const first = ts[0];
        const last = ts[ts.length - 1];
        const compositeKey = `${scope}:${keyPart}`;
        await pool.query(
          `INSERT INTO abuse_rate_limits (key, scope, attempts, first_attempt_at, last_attempt_at, blocked_until)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), NULL)
           ON CONFLICT (key) DO UPDATE SET
             scope = EXCLUDED.scope,
             attempts = EXCLUDED.attempts,
             first_attempt_at = EXCLUDED.first_attempt_at,
             last_attempt_at = EXCLUDED.last_attempt_at,
             blocked_until = NULL`,
          [compositeKey, scope, ts.length, first, last],
        );
        importedAbuseRates++;
      } catch {
        abuseRateErrors++;
      }
    }
  }

  // 4) abuse_events (from JSONL)
  if (fs.existsSync(ABUSE_LOG_PATH)) {
    const scope = deriveScopeFromPath(ABUSE_LOG_PATH);
    const raw = fs.readFileSync(ABUSE_LOG_PATH, "utf8");
    const lines = raw.split(/\\r?\\n/).filter((l) => l.trim());
    for (const line of lines) {
      try {
        let obj = null;
        try {
          obj = JSON.parse(line);
        } catch {
          skippedEvents++;
          continue;
        }
        const eventType = obj && typeof obj === "object" && typeof obj.type === "string" ? obj.type : "suspicious";
        const key =
          obj && typeof obj === "object" && typeof obj.ip === "string" ? obj.ip :
          obj && typeof obj === "object" && typeof obj.value === "string" ? obj.value :
          "unknown";
        await pool.query(
          "INSERT INTO abuse_events(scope, key, event_type, payload_json) VALUES($1,$2,$3,$4)",
          [scope, String(key ?? "unknown"), String(eventType ?? "suspicious"), line],
        );
        importedEvents++;
      } catch {
        eventErrors++;
      }
    }
  }
} finally {
  await pool.end().catch(() => undefined);
}

console.log(
  JSON.stringify(
    {
      sms_codes: { imported: importedCodes, skipped: skippedCodes, errors: codeErrors },
      sms_rate_limits: { imported: importedSmsRates, skipped: skippedSmsRates, errors: smsRateErrors },
      abuse_rate_limits: { imported: importedAbuseRates, skipped: skippedAbuseRates, errors: abuseRateErrors },
      abuse_events: { imported: importedEvents, skipped: skippedEvents, errors: eventErrors },
    },
    null,
    2,
  ),
);

