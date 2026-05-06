/**
 * One-shot migration: `.data/calls.json` → PostgreSQL `audio_calls`.
 * Idempotent: ON CONFLICT (call_id) DO NOTHING.
 * Does not delete or modify calls.json.
 *
 * Usage (from repo root):
 *   DATABASE_URL=... node scripts/migrate-calls-to-postgres.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const callsPath = path.join(root, ".data", "calls.json");

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

async function main() {
  let raw;
  try {
    raw = fs.readFileSync(callsPath, "utf8");
  } catch {
    console.log("No .data/calls.json — nothing to migrate.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Invalid JSON in calls.json.");
    process.exit(1);
  }

  const list =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.values(parsed)
      : Array.isArray(parsed)
        ? parsed
        : [];

  const pool = new pg.Pool({ connectionString: cs, max: 5 });
  let inserted = 0;
  let skipped = 0;

  try {
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const callId = String(c.callId ?? "").trim();
      const chatId = String(c.chatId ?? "").trim();
      if (!callId || !chatId) continue;

      const res = await pool.query(
        `INSERT INTO audio_calls (
          call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
          status, created_at, updated_at, expires_at,
          offer_json, answer_json, ice_from_caller, ice_from_callee
        ) VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13::text[],$14::text[])
        ON CONFLICT (call_id) DO NOTHING`,
        [
          callId,
          chatId,
          String(c.roomToken ?? "").trim() || randomIdFallback(),
          String(c.callerId ?? "").trim(),
          typeof c.callerDisplayName === "string" && c.callerDisplayName.trim()
            ? c.callerDisplayName.trim().slice(0, 200)
            : null,
          asArray(c.participantIds).map((x) => String(x ?? "").trim()).filter(Boolean),
          String(c.status ?? "pending"),
          Number(c.createdAt) || Date.now(),
          Number(c.updatedAt) || Date.now(),
          Number(c.expiresAt) || Date.now(),
          typeof c.offerJson === "string" ? c.offerJson : null,
          typeof c.answerJson === "string" ? c.answerJson : null,
          asArray(c.iceFromCaller).map((x) => String(x)),
          asArray(c.iceFromCallee).map((x) => String(x)),
        ],
      );
      if (res.rowCount > 0) inserted += 1;
      else skipped += 1;
    }
  } finally {
    await pool.end();
  }

  console.log(`Migrate calls: inserted ${inserted}, skipped (already present) ${skipped}. Source file unchanged.`);
}

function randomIdFallback() {
  return `rt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
