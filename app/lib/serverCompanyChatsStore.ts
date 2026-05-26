import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type { ChatMessageProvider } from "./chatMessageProvider";
import { providerFieldsFromPgConversation, providerFieldsFromPgMessage } from "./chatMessageProvider";

const DATA_DIR = path.join(process.cwd(), ".data");
const COMPANY_CHATS_PATH = path.join(DATA_DIR, "company-conversations.json");

export type StoredCompanyChatMessage = {
  id: string;
  conversationId: string;
  companyId: number;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: number;
  readAt: number | null;
  type?: "text" | "file";
  fileUrl?: string;
  fileName?: string;
  senderName?: string;
  replyToMessageId?: string;
  replyToText?: string;
  editedAt?: string;
  provider?: ChatMessageProvider;
  externalMessageId?: string;
  providerMetadata?: Record<string, unknown>;
};

export type CompanyConversationRecord = {
  conversationId: string;
  companyId: number;
  companyTitle: string;
  ownerUserId: string;
  customerId: string;
  participantIds: string[];
  lastMessageText: string;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
  messages: StoredCompanyChatMessage[];
  provider?: ChatMessageProvider;
  externalChatId?: string;
};

type ChatsFile = { conversations: Record<string, CompanyConversationRecord> };

type PgCompanyConvRow = {
  conversation_id: string;
  company_id: number;
  company_title: string;
  owner_user_id: string;
  customer_id: string;
  participant_ids: string[];
  last_message_text: string;
  last_message_at: string | number;
  created_at: string | number;
  updated_at: string | number;
  provider?: string | null;
  external_chat_id?: string | null;
};

type PgCompanyMsgRow = {
  conversation_id: string;
  message_id: string;
  company_id: number;
  sender_id: string;
  recipient_id: string;
  type: string;
  text: string;
  file_url: string | null;
  file_name: string | null;
  sender_name: string | null;
  reply_to_message_id: string | null;
  reply_to_text: string | null;
  edited_at: string | null;
  created_at: string | number;
  read_at: string | number | null;
  provider?: string | null;
  external_message_id?: string | null;
  provider_metadata?: unknown;
};

const PG_COMPANY_CONV_SELECT = `conversation_id, company_id, company_title, owner_user_id, customer_id, participant_ids,
              last_message_text, last_message_at, created_at, updated_at, provider, external_chat_id`;

const PG_COMPANY_MSG_SELECT = `conversation_id, message_id, company_id, sender_id, recipient_id, type, text,
              file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at,
              created_at, read_at, provider, external_message_id, provider_metadata`;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function messageFromPg(r: PgCompanyMsgRow): StoredCompanyChatMessage {
  return {
    id: r.message_id,
    conversationId: r.conversation_id,
    companyId: r.company_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    text: r.text ?? "",
    createdAt: num(r.created_at),
    readAt: r.read_at == null ? null : num(r.read_at),
    type: r.type === "file" ? "file" : "text",
    ...(r.file_url ? { fileUrl: r.file_url } : {}),
    ...(r.file_name ? { fileName: r.file_name } : {}),
    ...(r.sender_name ? { senderName: r.sender_name } : {}),
    ...(r.reply_to_message_id ? { replyToMessageId: r.reply_to_message_id } : {}),
    ...(r.reply_to_text ? { replyToText: r.reply_to_text } : {}),
    ...(r.edited_at ? { editedAt: r.edited_at } : {}),
    ...providerFieldsFromPgMessage(r),
  };
}

function conversationFromPg(c: PgCompanyConvRow, messages: StoredCompanyChatMessage[]): CompanyConversationRecord {
  const channel = providerFieldsFromPgConversation(c);
  return {
    conversationId: c.conversation_id,
    companyId: Number(c.company_id),
    companyTitle: c.company_title,
    ownerUserId: c.owner_user_id,
    customerId: c.customer_id,
    participantIds: Array.isArray(c.participant_ids) ? [...c.participant_ids] : [],
    lastMessageText: c.last_message_text ?? "",
    lastMessageAt: num(c.last_message_at),
    createdAt: num(c.created_at),
    updatedAt: num(c.updated_at),
    messages,
    ...channel,
  };
}

async function ensureCompanyChatTables(): Promise<void> {
  if (!usesPostgres()) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_conversations (
      conversation_id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      company_title TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      participant_ids TEXT[] NOT NULL,
      last_message_text TEXT NOT NULL DEFAULT '',
      last_message_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'internal',
      external_chat_id TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_conversations_participants_idx ON company_conversations USING GIN (participant_ids)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_conversations_company_last_message_at_idx ON company_conversations (company_id, last_message_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_messages (
      conversation_id TEXT NOT NULL REFERENCES company_conversations (conversation_id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      company_id INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      text TEXT NOT NULL DEFAULT '',
      file_url TEXT,
      file_name TEXT,
      sender_name TEXT,
      reply_to_message_id TEXT,
      reply_to_text TEXT,
      edited_at TEXT,
      created_at BIGINT NOT NULL,
      read_at BIGINT,
      provider TEXT NOT NULL DEFAULT 'internal',
      external_message_id TEXT,
      provider_metadata JSONB,
      PRIMARY KEY (conversation_id, message_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_messages_conversation_created_at_idx ON company_messages (conversation_id, created_at ASC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_messages_recipient_read_at_idx ON company_messages (recipient_id, read_at)`);
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(p, "utf8");
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

async function readDb(): Promise<ChatsFile> {
  assertFileStoreNotUsedInProduction("serverCompanyChatsStore.readDb", { path: COMPANY_CHATS_PATH });
  return readJson<ChatsFile>(COMPANY_CHATS_PATH, { conversations: {} });
}

async function writeDb(db: ChatsFile): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCompanyChatsStore.writeDb", { path: COMPANY_CHATS_PATH });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(COMPANY_CHATS_PATH, JSON.stringify(db, null, 2), "utf8");
}

function newMessageId() {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

export function buildCompanyConversationId(companyId: number, ownerUserId: string, customerId: string): string {
  return `company:${Math.trunc(companyId)}::${ownerUserId.trim()}::${customerId.trim()}`;
}

export function parseCompanyConversationId(conversationId: string): { companyId: number; ownerUserId: string; customerId: string } | null {
  const parts = conversationId.trim().split("::").map((x) => x.trim());
  if (parts.length !== 3 || !parts[0]?.startsWith("company:")) return null;
  const companyId = Number(parts[0].slice("company:".length));
  const ownerUserId = parts[1] ?? "";
  const customerId = parts[2] ?? "";
  if (!Number.isFinite(companyId) || companyId <= 0 || !ownerUserId || !customerId || ownerUserId === customerId) return null;
  return { companyId, ownerUserId, customerId };
}

export function isCompanyConversationParticipant(userId: string, conversationId: string): boolean {
  const p = parseCompanyConversationId(conversationId);
  const uid = userId.trim();
  return Boolean(p && (uid === p.ownerUserId || uid === p.customerId));
}

export function unreadCompanyCountForUser(conv: CompanyConversationRecord, userId: string): number {
  return conv.messages.filter((m) => m.recipientId === userId.trim() && m.readAt === null).length;
}

export function pickLatestStoredCompanyMessage(conv: CompanyConversationRecord): StoredCompanyChatMessage | null {
  return conv.messages.reduce<StoredCompanyChatMessage | null>((best, msg) => (!best || msg.createdAt >= best.createdAt ? msg : best), null);
}

export async function getCompanyConversation(conversationId: string): Promise<CompanyConversationRecord | null> {
  const cid = conversationId.trim();
  if (!cid) return null;
  if (usesPostgres()) {
    await ensureCompanyChatTables();
    const pool = getPool();
    const { rows } = await pool.query<PgCompanyConvRow>(
      `SELECT ${PG_COMPANY_CONV_SELECT}
       FROM company_conversations
       WHERE conversation_id = $1
       LIMIT 1`,
      [cid],
    );
    const conv = rows[0];
    if (!conv) return null;
    const { rows: msgRows } = await pool.query<PgCompanyMsgRow>(
      `SELECT ${PG_COMPANY_MSG_SELECT}
       FROM company_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [cid],
    );
    return conversationFromPg(conv, msgRows.map(messageFromPg));
  }
  return (await readDb()).conversations[cid] ?? null;
}

export async function listCompanyConversationsForUser(userId: string): Promise<CompanyConversationRecord[]> {
  const uid = userId.trim();
  if (!uid) return [];
  if (usesPostgres()) {
    await ensureCompanyChatTables();
    const pool = getPool();
    const { rows } = await pool.query<PgCompanyConvRow>(
      `SELECT ${PG_COMPANY_CONV_SELECT}
       FROM company_conversations
       WHERE $1 = ANY(participant_ids)
       ORDER BY last_message_at DESC`,
      [uid],
    );
    if (!rows.length) return [];
    const ids = rows.map((r) => r.conversation_id);
    const { rows: msgRows } = await pool.query<PgCompanyMsgRow>(
      `SELECT ${PG_COMPANY_MSG_SELECT}
       FROM company_messages
       WHERE conversation_id = ANY($1::text[])
       ORDER BY conversation_id, created_at ASC`,
      [ids],
    );
    const byCid = new Map<string, StoredCompanyChatMessage[]>();
    for (const row of msgRows) byCid.set(row.conversation_id, [...(byCid.get(row.conversation_id) ?? []), messageFromPg(row)]);
    return rows.map((row) => conversationFromPg(row, byCid.get(row.conversation_id) ?? []));
  }
  return Object.values((await readDb()).conversations)
    .filter((c) => c.participantIds.includes(uid))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export async function appendCompanyChatMessage(input: {
  conversationId: string;
  companyId: number;
  companyTitle: string;
  ownerUserId: string;
  customerId: string;
  senderId: string;
  recipientId: string;
  text: string;
  type?: "text" | "file";
  fileUrl?: string;
  fileName?: string;
  senderName?: string;
  replyToMessageId?: string;
  replyToText?: string;
}): Promise<StoredCompanyChatMessage> {
  const now = Date.now();
  const msg: StoredCompanyChatMessage = {
    id: newMessageId(),
    conversationId: input.conversationId,
    companyId: input.companyId,
    senderId: input.senderId,
    recipientId: input.recipientId,
    text: input.text,
    createdAt: now,
    readAt: null,
    type: input.type ?? "text",
    ...(input.fileUrl ? { fileUrl: input.fileUrl } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.senderName ? { senderName: input.senderName } : {}),
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
    ...(input.replyToText ? { replyToText: input.replyToText } : {}),
  };
  if (usesPostgres()) {
    await ensureCompanyChatTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO company_conversations
           (conversation_id, company_id, company_title, owner_user_id, customer_id, participant_ids,
            last_message_text, last_message_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (conversation_id) DO UPDATE SET
           company_title = EXCLUDED.company_title,
           last_message_text = EXCLUDED.last_message_text,
           last_message_at = EXCLUDED.last_message_at,
           updated_at = EXCLUDED.updated_at`,
        [
          input.conversationId,
          input.companyId,
          input.companyTitle,
          input.ownerUserId,
          input.customerId,
          [input.ownerUserId, input.customerId],
          input.type === "file" ? (input.text.trim() || "Вложение") : input.text,
          now,
          now,
          now,
        ],
      );
      await client.query(
        `INSERT INTO company_messages
           (conversation_id, message_id, company_id, sender_id, recipient_id, type, text,
            file_url, file_name, sender_name, reply_to_message_id, reply_to_text, created_at, read_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)`,
        [
          msg.conversationId,
          msg.id,
          msg.companyId,
          msg.senderId,
          msg.recipientId,
          msg.type ?? "text",
          msg.text,
          msg.fileUrl ?? null,
          msg.fileName ?? null,
          msg.senderName ?? null,
          msg.replyToMessageId ?? null,
          msg.replyToText ?? null,
          msg.createdAt,
        ],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return msg;
  }
  const db = await readDb();
  const existing = db.conversations[input.conversationId];
  const next: CompanyConversationRecord = existing ?? {
    conversationId: input.conversationId,
    companyId: input.companyId,
    companyTitle: input.companyTitle,
    ownerUserId: input.ownerUserId,
    customerId: input.customerId,
    participantIds: [input.ownerUserId, input.customerId],
    lastMessageText: "",
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  next.companyTitle = input.companyTitle;
  next.lastMessageText = input.type === "file" ? (input.text.trim() || "Вложение") : input.text;
  next.lastMessageAt = now;
  next.updatedAt = now;
  next.messages = [...next.messages, msg];
  db.conversations[input.conversationId] = next;
  await writeDb(db);
  return msg;
}

export async function markCompanyConversationRead(conversationId: string, userId: string): Promise<number> {
  const cid = conversationId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return 0;
  const now = Date.now();
  if (usesPostgres()) {
    await ensureCompanyChatTables();
    const res = await getPool().query(
      `UPDATE company_messages SET read_at = $3 WHERE conversation_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
      [cid, uid, now],
    );
    return res.rowCount ?? 0;
  }
  const db = await readDb();
  const conv = db.conversations[cid];
  if (!conv) return 0;
  let count = 0;
  conv.messages = conv.messages.map((m) => {
    if (m.recipientId !== uid || m.readAt !== null) return m;
    count += 1;
    return { ...m, readAt: now };
  });
  if (count) await writeDb(db);
  return count;
}
