/**
 * Idempotent migration:
 * - `.data/listing-conversations.json` → PostgreSQL `listing_conversations` + `listing_messages`
 * - `.data/chat-message-registry.json` → PostgreSQL `chat_message_registry`
 * - `.data/chat-message-deletions.json` → PostgreSQL `chat_message_deletions`
 *
 * Safe to run multiple times. Does NOT delete/modify source `.data` files.
 *
 * Requirements:
 * - `psql` available in PATH
 * - `DATABASE_URL` set OR set `PG*` env vars recognized by `psql`
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data");

const CONVS_PATH = path.join(DATA_DIR, "listing-conversations.json");
const REGISTRY_PATH = path.join(DATA_DIR, "chat-message-registry.json");
const DELETIONS_PATH = path.join(DATA_DIR, "chat-message-deletions.json");

function q(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function toBigint(n, fb = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fb;
}

function toTextArrayLiteral(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "ARRAY[]::text[]";
  const cleaned = [];
  for (const x of arr) {
    const v = String(x ?? "").trim();
    if (!v) continue;
    cleaned.push(`'${q(v)}'`);
  }
  if (cleaned.length === 0) return "ARRAY[]::text[]";
  return `ARRAY[${cleaned.join(",")}]::text[]`;
}

async function readListingConversations() {
  try {
    const raw = await fs.readFile(CONVS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const convs = parsed?.conversations && typeof parsed.conversations === "object" ? parsed.conversations : {};
    return convs;
  } catch {
    return {};
  }
}

async function readJsonObject(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildSql({ conversations, registry, deletions }) {
  let convCount = 0;
  let msgCount = 0;
  let regCount = 0;
  let delCount = 0;

  const parts = [];
  parts.push("BEGIN;");

  // Conversations + messages
  for (const [convIdRaw, conv] of Object.entries(conversations ?? {})) {
    if (!conv || typeof conv !== "object") continue;
    const c = conv;
    const conversationId = String(c.conversationId ?? convIdRaw ?? "").trim();
    const listingId = String(c.listingId ?? "").trim();
    const listingTitle = String(c.listingTitle ?? "").trim() || "Объявление";
    const listingOwnerId = String(c.listingOwnerId ?? "").trim();
    const buyerId = String(c.buyerId ?? "").trim();
    const participantIds = Array.isArray(c.participantIds) ? c.participantIds : [];
    const lastMessageText = String(c.lastMessageText ?? "");
    const lastMessageAt = toBigint(c.lastMessageAt, 0);
    const createdAt = toBigint(c.createdAt, 0);
    const updatedAt = toBigint(c.updatedAt, 0);

    if (!conversationId || !listingId || !listingOwnerId || !buyerId) continue;
    convCount += 1;

    parts.push(
      `INSERT INTO listing_conversations
  (conversation_id, listing_id, listing_title, listing_owner_id, buyer_id, participant_ids, last_message_text, last_message_at, created_at, updated_at)
VALUES
  ('${q(conversationId)}','${q(listingId)}','${q(listingTitle)}','${q(listingOwnerId)}','${q(buyerId)}',${toTextArrayLiteral(
        participantIds,
      )},'${q(lastMessageText)}',${lastMessageAt},${createdAt},${updatedAt})
ON CONFLICT (conversation_id) DO UPDATE SET
  listing_id = EXCLUDED.listing_id,
  listing_title = EXCLUDED.listing_title,
  listing_owner_id = EXCLUDED.listing_owner_id,
  buyer_id = EXCLUDED.buyer_id,
  participant_ids = EXCLUDED.participant_ids,
  last_message_text = EXCLUDED.last_message_text,
  last_message_at = EXCLUDED.last_message_at,
  created_at = LEAST(listing_conversations.created_at, EXCLUDED.created_at),
  updated_at = GREATEST(listing_conversations.updated_at, EXCLUDED.updated_at);`,
    );

    const messages = Array.isArray(c.messages) ? c.messages : [];
    for (const m of messages) {
      if (!m || typeof m !== "object") continue;
      const messageId = String(m.id ?? "").trim();
      const senderId = String(m.senderId ?? "").trim();
      const recipientId = String(m.recipientId ?? "").trim();
      const type = String(m.type ?? "text").trim() || "text";
      const text = typeof m.text === "string" ? m.text : "";
      const fileUrl = typeof m.fileUrl === "string" && m.fileUrl.trim() ? m.fileUrl.trim() : null;
      const fileName = typeof m.fileName === "string" && m.fileName.trim() ? m.fileName.trim() : null;
      const senderName = typeof m.senderName === "string" && m.senderName.trim() ? m.senderName.trim() : null;
      const replyToMessageId = typeof m.replyToMessageId === "string" && m.replyToMessageId.trim() ? m.replyToMessageId.trim() : null;
      const replyToText = typeof m.replyToText === "string" && m.replyToText.trim() ? m.replyToText.trim() : null;
      const editedAt = typeof m.editedAt === "string" && m.editedAt.trim() ? m.editedAt.trim() : null;
      const createdAtMsg = toBigint(m.createdAt, 0);
      const readAt = m.readAt === null || m.readAt === undefined ? null : toBigint(m.readAt, 0);

      if (!messageId || !senderId || !recipientId || !Number.isFinite(createdAtMsg)) continue;
      msgCount += 1;

      parts.push(
        `INSERT INTO listing_messages
  (conversation_id, message_id, listing_id, sender_id, recipient_id, type, text, file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at, created_at, read_at)
VALUES
  ('${q(conversationId)}','${q(messageId)}','${q(listingId)}','${q(senderId)}','${q(recipientId)}','${q(type)}','${q(
          text,
        )}',${fileUrl ? `'${q(fileUrl)}'` : "NULL"},${fileName ? `'${q(fileName)}'` : "NULL"},${
          senderName ? `'${q(senderName)}'` : "NULL"
        },${replyToMessageId ? `'${q(replyToMessageId)}'` : "NULL"},${replyToText ? `'${q(replyToText)}'` : "NULL"},${
          editedAt ? `'${q(editedAt)}'` : "NULL"
        },${createdAtMsg},${readAt === null ? "NULL" : String(readAt)})
ON CONFLICT (conversation_id, message_id) DO UPDATE SET
  listing_id = EXCLUDED.listing_id,
  sender_id = EXCLUDED.sender_id,
  recipient_id = EXCLUDED.recipient_id,
  type = EXCLUDED.type,
  text = EXCLUDED.text,
  file_url = EXCLUDED.file_url,
  file_name = EXCLUDED.file_name,
  sender_name = EXCLUDED.sender_name,
  reply_to_message_id = EXCLUDED.reply_to_message_id,
  reply_to_text = EXCLUDED.reply_to_text,
  edited_at = COALESCE(EXCLUDED.edited_at, listing_messages.edited_at),
  created_at = LEAST(listing_messages.created_at, EXCLUDED.created_at),
  read_at = COALESCE(EXCLUDED.read_at, listing_messages.read_at);`,
      );
    }
  }

  // Registry rows: Record<chatId, Record<messageId, { senderId, createdAt }>>
  for (const [chatId, perMsg] of Object.entries(registry ?? {})) {
    if (!perMsg || typeof perMsg !== "object") continue;
    for (const [messageId, row] of Object.entries(perMsg ?? {})) {
      if (!row || typeof row !== "object") continue;
      const senderId = String(row.senderId ?? "").trim();
      const createdAt = toBigint(row.createdAt, 0);
      const cid = String(chatId ?? "").trim();
      const mid = String(messageId ?? "").trim();
      if (!cid || !mid || !senderId) continue;
      regCount += 1;
      parts.push(
        `INSERT INTO chat_message_registry (chat_id, message_id, sender_id, created_at)
VALUES ('${q(cid)}','${q(mid)}','${q(senderId)}',${createdAt})
ON CONFLICT (chat_id, message_id) DO UPDATE SET
  sender_id = EXCLUDED.sender_id,
  created_at = LEAST(chat_message_registry.created_at, EXCLUDED.created_at);`,
      );
    }
  }

  // Deletions rows: Record<chatId, Record<messageId, MessageDeletionRow>>
  for (const [chatId, perMsg] of Object.entries(deletions ?? {})) {
    if (!perMsg || typeof perMsg !== "object") continue;
    for (const [messageId, row] of Object.entries(perMsg ?? {})) {
      if (!row || typeof row !== "object") continue;
      const cid = String(chatId ?? "").trim();
      const mid = String(messageId ?? "").trim();
      if (!cid || !mid) continue;
      const deletedForEveryone = row.deletedForEveryone === true;
      const deletedAt = row.deletedAt === undefined ? null : toBigint(row.deletedAt, 0);
      const deletedByUserId =
        typeof row.deletedByUserId === "string" && row.deletedByUserId.trim() ? row.deletedByUserId.trim() : null;
      const deletedForUserIds = Array.isArray(row.deletedForUserIds) ? row.deletedForUserIds : [];
      delCount += 1;
      parts.push(
        `INSERT INTO chat_message_deletions (chat_id, message_id, deleted_for_everyone, deleted_at, deleted_by_user_id, deleted_for_user_ids)
VALUES ('${q(cid)}','${q(mid)}',${deletedForEveryone ? "TRUE" : "FALSE"},${deletedAt === null ? "NULL" : String(deletedAt)},${
          deletedByUserId ? `'${q(deletedByUserId)}'` : "NULL"
        },${toTextArrayLiteral(deletedForUserIds)})
ON CONFLICT (chat_id, message_id) DO UPDATE SET
  deleted_for_everyone = (chat_message_deletions.deleted_for_everyone OR EXCLUDED.deleted_for_everyone),
  deleted_at = COALESCE(EXCLUDED.deleted_at, chat_message_deletions.deleted_at),
  deleted_by_user_id = COALESCE(EXCLUDED.deleted_by_user_id, chat_message_deletions.deleted_by_user_id),
  deleted_for_user_ids = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(chat_message_deletions.deleted_for_user_ids, ARRAY[]::text[]) || COALESCE(EXCLUDED.deleted_for_user_ids, ARRAY[]::text[])) AS x));`,
      );
    }
  }

  parts.push("COMMIT;");

  return {
    sql: parts.join("\n"),
    counts: { conversations: convCount, messages: msgCount, registryRows: regCount, deletionRows: delCount },
  };
}

function runPsql(sqlText) {
  const tmpDir = path.join(os.tmpdir(), "haliwali-migrate");
  const tmpPath = path.join(tmpDir, `listing-chats-${Date.now()}.sql`);
  return fs
    .mkdir(tmpDir, { recursive: true })
    .then(() => fs.writeFile(tmpPath, sqlText, "utf8"))
    .then(() => {
      const args = ["-v", "ON_ERROR_STOP=1", "-f", tmpPath];
      const res = spawnSync("psql", args, { stdio: "inherit", env: process.env });
      if (res.status !== 0) throw new Error(`psql failed (exit ${res.status ?? "unknown"})`);
    });
}

async function main() {
  const [conversations, registry, deletions] = await Promise.all([
    readListingConversations(),
    readJsonObject(REGISTRY_PATH),
    readJsonObject(DELETIONS_PATH),
  ]);

  const { sql, counts } = buildSql({ conversations, registry, deletions });
  console.log(
    `[migrate] conversations=${counts.conversations} messages=${counts.messages} registryRows=${counts.registryRows} deletionRows=${counts.deletionRows}`,
  );

  if (!counts.conversations && !counts.registryRows && !counts.deletionRows) {
    console.log("[migrate] nothing to do");
    return;
  }

  await runPsql(sql);
  console.log(
    `[migrate] migrated conversations=${counts.conversations} messages=${counts.messages} registry=${counts.registryRows} deletions=${counts.deletionRows}`,
  );
}

main().catch((e) => {
  console.error("[migrate] error", e);
  process.exit(1);
});

