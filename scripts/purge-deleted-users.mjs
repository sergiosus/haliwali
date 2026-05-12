import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pgPkg from "pg";

const { Pool } = pgPkg;

const PURGED_PUBLIC_LABEL = "Пользователь удалён";

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

async function unreachablePasswordHash() {
  const salt = randomBytes(24).toString("hex");
  return bcrypt.hash(`invalid:${salt}`, 10);
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

let purged = 0;
let skipped = 0;
let errors = 0;

try {
  const { rows } = await pool.query(
    `SELECT user_id
     FROM users
     WHERE deleted_at IS NOT NULL
       AND purged_at IS NULL
       AND purge_after IS NOT NULL
       AND purge_after <= NOW()`,
  );

  const passwordHash = await unreachablePasswordHash();
  const erasedAt = Date.now();

  for (const row of rows) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) {
      skipped += 1;
      continue;
    }
    try {
      await pool.query("BEGIN");
      await pool.query(
        `UPDATE users SET
           email = '',
           phone = '',
           password_hash = $2,
           phone_visible = FALSE,
           deletion_status = 'deleted',
           delete_requested_at = $3,
           delete_scheduled_at = NULL,
           last_seen_at = NULL,
           full_name = '',
           public_display_name = $4,
           purged_at = NOW()
         WHERE user_id = $1`,
        [userId, passwordHash, erasedAt, PURGED_PUBLIC_LABEL],
      );
      await pool.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
      await pool.query(
        `INSERT INTO admin_audit_log (admin_user_id, target_user_id, action, reason)
         VALUES ($1, $2, $3, $4)`,
        ["system", userId, "user_purged", "scheduled_purge"],
      );
      await pool.query("COMMIT");
      purged += 1;
    } catch (err) {
      errors += 1;
      try {
        await pool.query("ROLLBACK");
      } catch {
        // ignore
      }
      console.error("[purge-deleted-users] failed", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log({ purged, skipped, errors, due: rows.length });
} finally {
  await pool.end();
}

process.exit(errors > 0 ? 1 : 0);
