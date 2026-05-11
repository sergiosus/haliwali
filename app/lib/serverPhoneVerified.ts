import path from "node:path";
import { readFile } from "node:fs/promises";
import { getPool, usesPostgres } from "./pgPool";

const OWNERS_PATH = path.join(process.cwd(), ".data", "profile-phone-owners.json");

let migratedJsonOwnersToPg = false;

/** Legacy JSON map (dev / non-Postgres only). Production must never read `.data/profile-phone-owners.json`. */
async function readOwnersJson(): Promise<Record<string, string>> {
  if (process.env.NODE_ENV === "production") {
    return {};
  }
  try {
    const raw = await readFile(OWNERS_PATH, "utf8");
    const m = JSON.parse(raw) as unknown;
    if (!m || typeof m !== "object") return {};
    return m as Record<string, string>;
  } catch {
    return {};
  }
}

export async function migrateLegacyPhoneOwnersJsonToPgIfNeeded(): Promise<void> {
  if (!usesPostgres()) return;
  if (migratedJsonOwnersToPg) return;
  migratedJsonOwnersToPg = true;

  // Never touch legacy JSON stores in production (file store is forbidden there).
  if (process.env.NODE_ENV === "production") return;

  // One-time best-effort import from legacy JSON file.
  const m = await readOwnersJson();
  const entries = Object.entries(m).map(([phone, userId]) => [String(phone ?? "").trim(), String(userId ?? "").trim()]);
  const clean = entries.filter(([p, u]) => Boolean(p && u));
  if (clean.length === 0) return;

  const pool = getPool();
  for (const [phone, userId] of clean) {
    await pool.query(
      `INSERT INTO phone_owners (phone, user_id) VALUES ($1, $2)
       ON CONFLICT (phone) DO NOTHING`,
      [phone, userId],
    );
  }
}

export async function isUserPhoneVerified(userId: string): Promise<boolean> {
  const id = (userId ?? "").trim();
  if (!id) return false;
  if (usesPostgres()) {
    // In production, legacy JSON migration is forbidden; rely on the DB table if available.
    if (process.env.NODE_ENV !== "production") {
      await migrateLegacyPhoneOwnersJsonToPgIfNeeded();
    }
    try {
      const { rows } = await getPool().query<{ ok: number }>(
        `SELECT 1 AS ok FROM phone_owners WHERE user_id = $1 LIMIT 1`,
        [id],
      );
      return rows.length > 0;
    } catch (e) {
      // Fail closed (unverified) rather than crashing pages like `/map` that only need public info.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[phone-owners] phone_owners lookup failed", e);
      }
      return false;
    }
  }
  const m = await readOwnersJson();
  return Object.values(m).some((v) => v === id);
}
