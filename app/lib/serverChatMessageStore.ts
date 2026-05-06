import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

export function parseChatParticipantsFromChatId(chatId: string): string[] {
  const parts = chatId.split("::").map((x) => x.trim()).filter(Boolean);
  return parts.slice(1);
}

export function isChatParticipant(sessionUserId: string, chatId: string): boolean {
  const uid = (sessionUserId ?? "").trim();
  if (!uid) return false;
  const p = parseChatParticipantsFromChatId(chatId);
  return p.includes(uid);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const REGISTRY_PATH = path.join(DATA_DIR, "chat-message-registry.json");
const DELETIONS_PATH = path.join(DATA_DIR, "chat-message-deletions.json");

export type RegisteredMessage = { senderId: string; createdAt: number };

export type MessageDeletionRow = {
  deletedForEveryone?: boolean;
  deletedAt?: number;
  deletedByUserId?: string;
  /** User ids for whom the message is hidden (delete for me). */
  deletedForUserIds?: string[];
};

type RegistryDb = Record<string, Record<string, RegisteredMessage>>;
type DeletionsDb = Record<string, Record<string, MessageDeletionRow>>;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function readJson<T>(p: string, fb: T): Promise<T> {
  assertFileStoreNotUsedInProduction("serverChatMessageStore.readJson", { path: p });
  try {
    const raw = await readFile(p, "utf8");
    const v = JSON.parse(raw) as T;
    return v ?? fb;
  } catch {
    return fb;
  }
}

async function writeJson(p: string, data: unknown) {
  assertFileStoreNotUsedInProduction("serverChatMessageStore.writeJson", { path: p });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

export async function readRegistry(): Promise<RegistryDb> {
  if (usesPostgres()) {
    const pool = getPool();
    const { rows } = await pool.query<{
      chat_id: string;
      message_id: string;
      sender_id: string;
      created_at: string | number;
    }>(`SELECT chat_id, message_id, sender_id, created_at FROM chat_message_registry`);
    const db: RegistryDb = {};
    for (const r of rows) {
      if (!db[r.chat_id]) db[r.chat_id] = {};
      db[r.chat_id][r.message_id] = { senderId: r.sender_id, createdAt: num(r.created_at) };
    }
    return db;
  }
  return await readJson<RegistryDb>(REGISTRY_PATH, {});
}

export async function writeRegistry(db: RegistryDb) {
  if (usesPostgres()) return;
  await writeJson(REGISTRY_PATH, db);
}

export async function readDeletions(): Promise<DeletionsDb> {
  if (usesPostgres()) {
    const pool = getPool();
    const { rows } = await pool.query<{
      chat_id: string;
      message_id: string;
      deleted_for_everyone: boolean;
      deleted_at: string | number | null;
      deleted_by_user_id: string | null;
      deleted_for_user_ids: string[] | null;
    }>(
      `SELECT chat_id, message_id, deleted_for_everyone, deleted_at, deleted_by_user_id, deleted_for_user_ids
       FROM chat_message_deletions`,
    );
    const out: DeletionsDb = {};
    for (const r of rows) {
      if (!out[r.chat_id]) out[r.chat_id] = {};
      const row: MessageDeletionRow = {};
      if (r.deleted_for_everyone) row.deletedForEveryone = true;
      if (r.deleted_at != null) row.deletedAt = num(r.deleted_at);
      if (r.deleted_by_user_id) row.deletedByUserId = r.deleted_by_user_id;
      const uids = Array.isArray(r.deleted_for_user_ids) ? r.deleted_for_user_ids.filter(Boolean) : [];
      if (uids.length) row.deletedForUserIds = uids;
      out[r.chat_id][r.message_id] = row;
    }
    return out;
  }
  return await readJson<DeletionsDb>(DELETIONS_PATH, {});
}

export async function writeDeletions(db: DeletionsDb) {
  if (usesPostgres()) return;
  await writeJson(DELETIONS_PATH, db);
}

/** First registered sender wins (prevents spoofing another user's message id if id was already registered). */
export async function registerChatMessage(
  chatId: string,
  messageId: string,
  senderId: string,
  createdAt?: number,
): Promise<void> {
  const cid = chatId.trim();
  const mid = messageId.trim();
  const sid = senderId.trim();
  if (!cid || !mid || !sid) return;

  if (usesPostgres()) {
    const ts = typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : Date.now();
    await getPool().query(
      `INSERT INTO chat_message_registry (chat_id, message_id, sender_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chat_id, message_id) DO NOTHING`,
      [cid, mid, sid, ts],
    );
    return;
  }

  const db = await readRegistry();
  if (!db[cid]) db[cid] = {};
  if (!db[cid][mid]) {
    db[cid][mid] = { senderId: sid, createdAt: typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : Date.now() };
    await writeRegistry(db);
  }
}

export async function applyMessageDeletion(args: {
  chatId: string;
  messageId: string;
  actorUserId: string;
  scope: "me" | "everyone";
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const chatId = args.chatId.trim();
  const messageId = args.messageId.trim();
  const actor = args.actorUserId.trim();
  if (!chatId || !messageId || !actor) return { ok: false, error: "BAD_REQUEST", status: 400 };
  if (!isChatParticipant(actor, chatId)) return { ok: false, error: "FORBIDDEN", status: 403 };

  if (usesPostgres()) {
    const pool = getPool();

    if (args.scope === "me") {
      await pool.query(
        `INSERT INTO chat_message_deletions (chat_id, message_id, deleted_for_everyone, deleted_at, deleted_by_user_id, deleted_for_user_ids)
         VALUES ($1, $2, FALSE, NULL, NULL, ARRAY[$3]::text[])
         ON CONFLICT (chat_id, message_id) DO UPDATE SET
           deleted_for_user_ids = COALESCE(
             (
               SELECT array_agg(DISTINCT x)
               FROM unnest(
                 COALESCE(chat_message_deletions.deleted_for_user_ids, '{}'::text[]) ||
                 COALESCE(EXCLUDED.deleted_for_user_ids, '{}'::text[])
               ) AS u(x)
             ),
             '{}'::text[]
           )`,
        [chatId, messageId, actor],
      );
      return { ok: true };
    }

    const reg = await pool.query<{ sender_id: string }>(
      `SELECT sender_id FROM chat_message_registry WHERE chat_id = $1 AND message_id = $2 LIMIT 1`,
      [chatId, messageId],
    );
    const regSender = reg.rows[0]?.sender_id?.trim() ?? "";
    if (!regSender || regSender !== actor) {
      return { ok: false, error: "FORBIDDEN", status: 403 };
    }

    const now = Date.now();
    await pool.query(
      `INSERT INTO chat_message_deletions (chat_id, message_id, deleted_for_everyone, deleted_at, deleted_by_user_id, deleted_for_user_ids)
       VALUES ($1, $2, TRUE, $3, $4, NULL)
       ON CONFLICT (chat_id, message_id) DO UPDATE SET
         deleted_for_everyone = TRUE,
         deleted_at = EXCLUDED.deleted_at,
         deleted_by_user_id = EXCLUDED.deleted_by_user_id`,
      [chatId, messageId, now, actor],
    );
    return { ok: true };
  }

  const delDb = await readDeletions();
  if (!delDb[chatId]) delDb[chatId] = {};
  const row = delDb[chatId][messageId] ?? {};

  if (args.scope === "me") {
    const set = new Set(row.deletedForUserIds ?? []);
    set.add(actor);
    row.deletedForUserIds = [...set];
    delDb[chatId][messageId] = row;
    await writeDeletions(delDb);
    return { ok: true };
  }

  const regDb = await readRegistry();
  const reg = regDb[chatId]?.[messageId];
  if (!reg || reg.senderId !== actor) {
    return { ok: false, error: "FORBIDDEN", status: 403 };
  }
  row.deletedForEveryone = true;
  row.deletedAt = Date.now();
  row.deletedByUserId = actor;
  delDb[chatId][messageId] = row;
  await writeDeletions(delDb);
  return { ok: true };
}

export async function getDeletionsForChat(chatId: string): Promise<Record<string, MessageDeletionRow>> {
  const cid = chatId.trim();
  if (!cid) return {};

  if (usesPostgres()) {
    const { rows } = await getPool().query<{
      message_id: string;
      deleted_for_everyone: boolean;
      deleted_at: string | number | null;
      deleted_by_user_id: string | null;
      deleted_for_user_ids: string[] | null;
    }>(
      `SELECT message_id, deleted_for_everyone, deleted_at, deleted_by_user_id, deleted_for_user_ids
       FROM chat_message_deletions
       WHERE chat_id = $1`,
      [cid],
    );
    const out: Record<string, MessageDeletionRow> = {};
    for (const r of rows) {
      const row: MessageDeletionRow = {};
      if (r.deleted_for_everyone) row.deletedForEveryone = true;
      if (r.deleted_at != null) row.deletedAt = num(r.deleted_at);
      if (r.deleted_by_user_id) row.deletedByUserId = r.deleted_by_user_id;
      const uids = Array.isArray(r.deleted_for_user_ids) ? r.deleted_for_user_ids.filter(Boolean) : [];
      if (uids.length) row.deletedForUserIds = uids;
      out[r.message_id] = row;
    }
    return out;
  }

  const delDb = await readDeletions();
  return { ...(delDb[cid] ?? {}) };
}
