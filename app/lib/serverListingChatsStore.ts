import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeMergedChatFileUrl } from "./serverChatPrivateFiles";
import { getPool, usesPostgres } from "./pgPool";
import { normalizeListingId } from "./listingId";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const DATA_DIR = path.join(process.cwd(), ".data");
const LISTING_CHATS_PATH = path.join(DATA_DIR, "listing-conversations.json");

export type StoredListingChatMessage = {
  id: string;
  conversationId: string;
  listingId: string;
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
};

export type ListingConversationRecord = {
  conversationId: string;
  listingId: string;
  listingTitle: string;
  listingOwnerId: string;
  participantIds: string[];
  buyerId: string;
  lastMessageText: string;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
  messages: StoredListingChatMessage[];
};

type ChatsFile = { conversations: Record<string, ListingConversationRecord> };

type PgConvRow = {
  conversation_id: string;
  listing_id: string;
  listing_title: string;
  listing_owner_id: string;
  buyer_id: string;
  participant_ids: string[];
  last_message_text: string;
  last_message_at: string | number;
  created_at: string | number;
  updated_at: string | number;
};

type PgMsgRow = {
  conversation_id: string;
  message_id: string;
  listing_id: string;
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
};

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pgRowToStoredMessage(r: PgMsgRow): StoredListingChatMessage {
  const readAtRaw = r.read_at;
  return {
    id: r.message_id,
    conversationId: r.conversation_id,
    listingId: r.listing_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    text: r.text ?? "",
    createdAt: num(r.created_at),
    readAt: readAtRaw === null || readAtRaw === undefined ? null : num(readAtRaw),
    type: r.type === "file" ? "file" : "text",
    ...(r.file_url ? { fileUrl: r.file_url } : {}),
    ...(r.file_name ? { fileName: r.file_name } : {}),
    ...(r.sender_name ? { senderName: r.sender_name } : {}),
    ...(r.reply_to_message_id ? { replyToMessageId: r.reply_to_message_id } : {}),
    ...(r.reply_to_text ? { replyToText: r.reply_to_text } : {}),
    ...(r.edited_at ? { editedAt: r.edited_at } : {}),
  };
}

function pgConvAndMessagesToRecord(c: PgConvRow, messages: StoredListingChatMessage[]): ListingConversationRecord {
  return {
    conversationId: c.conversation_id,
    listingId: c.listing_id,
    listingTitle: c.listing_title,
    listingOwnerId: c.listing_owner_id,
    buyerId: c.buyer_id,
    participantIds: Array.isArray(c.participant_ids) ? [...c.participant_ids] : [],
    lastMessageText: c.last_message_text ?? "",
    lastMessageAt: num(c.last_message_at),
    createdAt: num(c.created_at),
    updatedAt: num(c.updated_at),
    messages,
  };
}

async function pgLoadConversation(conversationId: string): Promise<ListingConversationRecord | null> {
  const cid = conversationId.trim();
  if (!cid) return null;
  const pool = getPool();
  const { rows: convRows } = await pool.query<PgConvRow>(
    `SELECT conversation_id, listing_id, listing_title, listing_owner_id, buyer_id, participant_ids,
            last_message_text, last_message_at, created_at, updated_at
     FROM listing_conversations
     WHERE conversation_id = $1
     LIMIT 1`,
    [cid],
  );
  const c = convRows[0];
  if (!c) return null;
  const { rows: msgRows } = await pool.query<PgMsgRow>(
    `SELECT conversation_id, message_id, listing_id, sender_id, recipient_id, type, text,
            file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at,
            created_at, read_at
     FROM listing_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [cid],
  );
  return pgConvAndMessagesToRecord(c, msgRows.map(pgRowToStoredMessage));
}

async function readJson<T>(p: string, fb: T): Promise<T> {
  try {
    const raw = await readFile(p, "utf8");
    const v = JSON.parse(raw) as T;
    return v ?? fb;
  } catch {
    return fb;
  }
}

async function writeJson(p: string, data: unknown) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

async function readDb(): Promise<ChatsFile> {
  assertFileStoreNotUsedInProduction("serverListingChatsStore.readDb", { path: LISTING_CHATS_PATH });
  return await readJson<ChatsFile>(LISTING_CHATS_PATH, { conversations: {} });
}

async function writeDb(db: ChatsFile) {
  assertFileStoreNotUsedInProduction("serverListingChatsStore.writeDb", { path: LISTING_CHATS_PATH });
  await writeJson(LISTING_CHATS_PATH, db);
}

function newMessageId() {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

/** Canonical id aligned with client chatId: `listingId::ownerId::buyerId`. */
export function buildListingConversationId(listingId: string, ownerId: string, buyerId: string): string {
  const L = normalizeListingId(listingId);
  const o = ownerId.trim();
  const b = buyerId.trim();
  return `${L}::${o}::${b}`;
}

/** Inverse of buildListingConversationId (listing id must not contain `::`). */
export function parseListingConversationId(conversationId: string): { listingId: string; ownerId: string; buyerId: string } | null {
  const cid = conversationId.trim();
  const parts = cid.split("::").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const buyerId = parts[parts.length - 1]!;
  const ownerId = parts[parts.length - 2]!;
  const listingId = normalizeListingId(parts.slice(0, -2).join("::"));
  if (!listingId || !ownerId || !buyerId || ownerId === buyerId) return null;
  return { listingId, ownerId, buyerId };
}

export function isListingConversationParticipant(userId: string, conversationId: string): boolean {
  const p = parseListingConversationId(conversationId);
  if (!p) return false;
  const uid = userId.trim();
  return uid === p.ownerId || uid === p.buyerId;
}

export function unreadCountForUser(conv: ListingConversationRecord, userId: string): number {
  const uid = userId.trim();
  let n = 0;
  for (const m of conv.messages) {
    if (m.recipientId === uid && m.readAt === null) n += 1;
  }
  return n;
}

/** Latest message by `createdAt` (for API summaries). */
export function pickLatestStoredListingMessage(conv: ListingConversationRecord): StoredListingChatMessage | null {
  const msgs = conv.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  let best = msgs[0]!;
  for (let i = 1; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.createdAt >= best.createdAt) best = m;
  }
  return best;
}

export async function listListingConversationsForUser(userId: string): Promise<ListingConversationRecord[]> {
  const uid = userId.trim();
  if (!uid) return [];

  if (usesPostgres()) {
    const pool = getPool();
    const { rows: convs } = await pool.query<PgConvRow>(
      `SELECT conversation_id, listing_id, listing_title, listing_owner_id, buyer_id, participant_ids,
              last_message_text, last_message_at, created_at, updated_at
       FROM listing_conversations
       WHERE $1 = ANY(participant_ids)
       ORDER BY last_message_at DESC`,
      [uid],
    );
    if (convs.length === 0) return [];
    const ids = convs.map((c) => c.conversation_id);
    const { rows: msgRows } = await pool.query<PgMsgRow>(
      `SELECT conversation_id, message_id, listing_id, sender_id, recipient_id, type, text,
              file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at,
              created_at, read_at
       FROM listing_messages
       WHERE conversation_id = ANY($1::text[])
       ORDER BY conversation_id, created_at ASC`,
      [ids],
    );
    const byCid = new Map<string, StoredListingChatMessage[]>();
    for (const r of msgRows) {
      const arr = byCid.get(r.conversation_id) ?? [];
      arr.push(pgRowToStoredMessage(r));
      byCid.set(r.conversation_id, arr);
    }
    return convs.map((c) => pgConvAndMessagesToRecord(c, byCid.get(c.conversation_id) ?? []));
  }

  const db = await readDb();
  const out: ListingConversationRecord[] = [];
  for (const c of Object.values(db.conversations)) {
    if (!c.participantIds.includes(uid)) continue;
    out.push(c);
  }
  out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return out;
}

export async function totalUnreadForUser(userId: string): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  if (usesPostgres()) {
    const pool = getPool();
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM listing_messages lm
       INNER JOIN listing_conversations lc ON lc.conversation_id = lm.conversation_id
       WHERE $1 = ANY(lc.participant_ids)
         AND lm.recipient_id = $1
         AND lm.read_at IS NULL`,
      [uid],
    );
    const c = rows[0]?.cnt ?? "0";
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }

  const rows = await listListingConversationsForUser(uid);
  let t = 0;
  for (const c of rows) t += unreadCountForUser(c, uid);
  return t;
}

export async function getListingConversation(conversationId: string): Promise<ListingConversationRecord | null> {
  const cid = conversationId.trim();

  if (usesPostgres()) {
    return pgLoadConversation(cid);
  }

  const db = await readDb();
  return db.conversations[cid] ?? null;
}

export async function appendListingChatMessage(args: {
  conversationId: string;
  listingId: string;
  listingTitle: string;
  listingOwnerId: string;
  buyerId: string;
  senderId: string;
  recipientId: string;
  text: string;
  type?: "text" | "file";
  fileUrl?: string;
  fileName?: string;
  senderName?: string;
  replyToMessageId?: string;
  replyToText?: string;
}): Promise<StoredListingChatMessage> {
  const now = Date.now();
  const id = newMessageId();
  const msg: StoredListingChatMessage = {
    id,
    conversationId: args.conversationId,
    listingId: args.listingId,
    senderId: args.senderId.trim(),
    recipientId: args.recipientId.trim(),
    text: args.text,
    createdAt: now,
    readAt: null,
    type: args.type ?? "text",
    fileUrl: args.fileUrl,
    fileName: args.fileName,
    senderName: typeof args.senderName === "string" && args.senderName.trim() ? args.senderName.trim() : undefined,
    replyToMessageId: args.replyToMessageId,
    replyToText: args.replyToText,
  };

  const preview =
    msg.type === "file"
      ? (msg.fileName?.trim() ? `📎 ${msg.fileName.trim()}` : "Вложение")
      : msg.text.trim() || "Сообщение";

  const participants = [args.listingOwnerId.trim(), args.buyerId.trim()].sort();

  if (usesPostgres()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO listing_conversations
           (conversation_id, listing_id, listing_title, listing_owner_id, buyer_id, participant_ids,
            last_message_text, last_message_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (conversation_id) DO UPDATE SET
           listing_title = EXCLUDED.listing_title,
           listing_owner_id = EXCLUDED.listing_owner_id,
           buyer_id = EXCLUDED.buyer_id,
           participant_ids = EXCLUDED.participant_ids,
           last_message_text = EXCLUDED.last_message_text,
           last_message_at = EXCLUDED.last_message_at,
           updated_at = EXCLUDED.updated_at`,
        [
          args.conversationId,
          args.listingId,
          args.listingTitle,
          args.listingOwnerId.trim(),
          args.buyerId.trim(),
          participants,
          preview,
          now,
          now,
          now,
        ],
      );

      await client.query(
        `INSERT INTO listing_messages
           (conversation_id, message_id, listing_id, sender_id, recipient_id, type, text,
            file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at, created_at, read_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL)`,
        [
          args.conversationId,
          id,
          args.listingId,
          msg.senderId,
          msg.recipientId,
          msg.type ?? "text",
          msg.text,
          msg.fileUrl ?? null,
          msg.fileName ?? null,
          msg.senderName ?? null,
          msg.replyToMessageId ?? null,
          msg.replyToText ?? null,
          msg.editedAt ?? null,
          now,
        ],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return msg;
  }

  const db = await readDb();
  let conv = db.conversations[args.conversationId];
  if (!conv) {
    conv = {
      conversationId: args.conversationId,
      listingId: args.listingId,
      listingTitle: args.listingTitle,
      listingOwnerId: args.listingOwnerId.trim(),
      participantIds: participants,
      buyerId: args.buyerId.trim(),
      lastMessageText: preview,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    db.conversations[args.conversationId] = conv;
  } else {
    conv.listingTitle = args.listingTitle;
    conv.updatedAt = now;
    conv.lastMessageText = preview;
    conv.lastMessageAt = now;
    conv.participantIds = participants;
    conv.buyerId = args.buyerId.trim();
    conv.listingOwnerId = args.listingOwnerId.trim();
  }

  conv.messages.push(msg);
  await writeDb(db);
  return msg;
}

export async function markListingConversationRead(conversationId: string, readerUserId: string): Promise<number> {
  const uid = readerUserId.trim();
  const cid = conversationId.trim();
  if (!uid || !cid) return 0;

  if (usesPostgres()) {
    const pool = getPool();
    const now = Date.now();
    const res = await pool.query(
      `UPDATE listing_messages
       SET read_at = $3
       WHERE conversation_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
      [cid, uid, now],
    );
    const n = res.rowCount ?? 0;
    if (n > 0) {
      await pool.query(`UPDATE listing_conversations SET updated_at = $2 WHERE conversation_id = $1`, [cid, now]);
    }
    return n;
  }

  const db = await readDb();
  const conv = db.conversations[cid];
  if (!conv) return 0;
  const now = Date.now();
  let n = 0;
  for (const m of conv.messages) {
    if (m.recipientId === uid && m.readAt === null) {
      m.readAt = now;
      n += 1;
    }
  }
  if (n > 0) {
    conv.updatedAt = now;
    await writeDb(db);
  }
  return n;
}

function previewFromMessage(msg: Pick<StoredListingChatMessage, "type" | "text" | "fileName">): string {
  if (msg.type === "file") {
    return msg.fileName?.trim() ? `📎 ${msg.fileName.trim()}` : "Вложение";
  }
  return msg.text.trim() || "Сообщение";
}

async function upsertListingMessagesPg(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  messages: StoredListingChatMessage[],
): Promise<void> {
  for (const m of messages) {
    await client.query(
      `INSERT INTO listing_messages
         (conversation_id, message_id, listing_id, sender_id, recipient_id, type, text,
          file_url, file_name, sender_name, reply_to_message_id, reply_to_text, edited_at, created_at, read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
         edited_at = EXCLUDED.edited_at,
         created_at = LEAST(listing_messages.created_at, EXCLUDED.created_at),
         read_at = COALESCE(listing_messages.read_at, EXCLUDED.read_at)`,
      [
        m.conversationId,
        m.id,
        m.listingId,
        m.senderId,
        m.recipientId,
        m.type ?? "text",
        m.text,
        m.fileUrl ?? null,
        m.fileName ?? null,
        m.senderName ?? null,
        m.replyToMessageId ?? null,
        m.replyToText ?? null,
        m.editedAt ?? null,
        m.createdAt,
        m.readAt,
      ],
    );
  }
}

export type ClientChatSyncMessage = {
  id: string;
  senderId: string;
  senderName?: string;
  createdAt: number;
  type?: "text" | "file";
  text?: string;
  fileUrl?: string;
  fileName?: string;
  replyToMessageId?: string;
  replyToText?: string;
  editedAt?: string;
};

/**
 * Идемпотентно сливает снимок сообщений с клиента (localStorage) в серверное хранилище.
 * Нужен, чтобы первый заход в чат поднял историю в общий источник для вкладки «Сообщения».
 */
export async function mergeClientSnapshot(args: {
  conversationId: string;
  viewerUserId: string;
  listingId: string;
  listingTitle: string;
  listingOwnerId: string;
  buyerId: string;
  messages: ClientChatSyncMessage[];
}): Promise<void> {
  const viewer = args.viewerUserId.trim();
  const cid = args.conversationId.trim();
  const owner = args.listingOwnerId.trim();
  const buyer = args.buyerId.trim();
  const L = normalizeListingId(args.listingId);
  if (!viewer || !cid || !owner || !buyer || owner === buyer || !L) return;

  const expected = buildListingConversationId(L, owner, buyer);
  if (cid !== expected) return;

  if (viewer !== owner && viewer !== buyer) return;

  const participants = [owner, buyer].sort();
  const now = Date.now();
  const titleTrim = args.listingTitle.trim() || "Объявление";

  if (usesPostgres()) {
    const pool = getPool();
    const existing = await pgLoadConversation(cid);
    let conv: ListingConversationRecord;
    if (!existing) {
      conv = {
        conversationId: cid,
        listingId: L,
        listingTitle: titleTrim,
        listingOwnerId: owner,
        participantIds: participants,
        buyerId: buyer,
        lastMessageText: "",
        lastMessageAt: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
    } else {
      conv = {
        ...existing,
        listingTitle: titleTrim,
        listingOwnerId: owner,
        buyerId: buyer,
        participantIds: participants,
      };
    }

    const byId = new Map<string, StoredListingChatMessage>();
    for (const m of conv.messages) {
      byId.set(m.id, { ...m });
    }

    for (const cm of args.messages) {
      const mid = typeof cm.id === "string" ? cm.id.trim() : "";
      const senderId = typeof cm.senderId === "string" ? cm.senderId.trim() : "";
      if (!mid || !senderId) continue;
      if (senderId !== owner && senderId !== buyer) continue;
      const createdAt = typeof cm.createdAt === "number" && Number.isFinite(cm.createdAt) ? cm.createdAt : now;
      const recipientId = senderId === owner ? buyer : owner;
      const type: "text" | "file" = cm.type === "file" ? "file" : "text";
      const textRaw = typeof cm.text === "string" ? cm.text : "";
      const textOut = type === "file" ? textRaw : textRaw;

      const prevRow = byId.get(mid);
      const rawFu = typeof cm.fileUrl === "string" && cm.fileUrl.trim() ? cm.fileUrl.trim() : undefined;
      const fileUrlMerged = await sanitizeMergedChatFileUrl(type, rawFu, cid, senderId, prevRow?.fileUrl);

      const next: StoredListingChatMessage = {
        id: mid,
        conversationId: cid,
        listingId: L,
        senderId,
        recipientId,
        text: textOut,
        createdAt,
        readAt: null,
        type,
        fileUrl: fileUrlMerged,
        fileName: typeof cm.fileName === "string" && cm.fileName.trim() ? cm.fileName.trim() : undefined,
        senderName: typeof cm.senderName === "string" && cm.senderName.trim() ? cm.senderName.trim() : undefined,
        replyToMessageId: typeof cm.replyToMessageId === "string" && cm.replyToMessageId.trim() ? cm.replyToMessageId.trim() : undefined,
        replyToText: typeof cm.replyToText === "string" && cm.replyToText.trim() ? cm.replyToText.trim() : undefined,
        editedAt: typeof cm.editedAt === "string" ? cm.editedAt : undefined,
      };

      const prev = prevRow;
      if (!prev) {
        byId.set(mid, next);
        continue;
      }
      byId.set(mid, {
        ...prev,
        ...next,
        createdAt: Math.min(prev.createdAt, createdAt),
        readAt: prev.readAt ?? next.readAt,
      });
    }

    conv.messages = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
    const last = conv.messages[conv.messages.length - 1];
    const lastPreview = last ? previewFromMessage(last) : "";
    const lastAt = last ? last.createdAt : 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const createdConv = existing ? existing.createdAt : now;
      await client.query(
        `INSERT INTO listing_conversations
           (conversation_id, listing_id, listing_title, listing_owner_id, buyer_id, participant_ids,
            last_message_text, last_message_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (conversation_id) DO UPDATE SET
           listing_title = EXCLUDED.listing_title,
           listing_owner_id = EXCLUDED.listing_owner_id,
           buyer_id = EXCLUDED.buyer_id,
           participant_ids = EXCLUDED.participant_ids,
           last_message_text = EXCLUDED.last_message_text,
           last_message_at = EXCLUDED.last_message_at,
           updated_at = EXCLUDED.updated_at`,
        [cid, L, titleTrim, owner, buyer, participants, lastPreview, lastAt, createdConv, now],
      );

      await upsertListingMessagesPg(client, conv.messages);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  const db = await readDb();
  let conv = db.conversations[cid];

  if (!conv) {
    conv = {
      conversationId: cid,
      listingId: L,
      listingTitle: titleTrim,
      listingOwnerId: owner,
      participantIds: participants,
      buyerId: buyer,
      lastMessageText: "",
      lastMessageAt: 0,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    db.conversations[cid] = conv;
  } else {
    conv.listingTitle = titleTrim;
    conv.listingOwnerId = owner;
    conv.buyerId = buyer;
    conv.participantIds = participants;
  }

  const byId = new Map<string, StoredListingChatMessage>();
  for (const m of conv.messages) {
    byId.set(m.id, { ...m });
  }

  for (const cm of args.messages) {
    const mid = typeof cm.id === "string" ? cm.id.trim() : "";
    const senderId = typeof cm.senderId === "string" ? cm.senderId.trim() : "";
    if (!mid || !senderId) continue;
    if (senderId !== owner && senderId !== buyer) continue;
    const createdAt = typeof cm.createdAt === "number" && Number.isFinite(cm.createdAt) ? cm.createdAt : now;
    const recipientId = senderId === owner ? buyer : owner;
    const type: "text" | "file" = cm.type === "file" ? "file" : "text";
    const textRaw = typeof cm.text === "string" ? cm.text : "";
    const textOut = type === "file" ? textRaw : textRaw;

    const prevRow = byId.get(mid);
    const rawFu = typeof cm.fileUrl === "string" && cm.fileUrl.trim() ? cm.fileUrl.trim() : undefined;
    const fileUrlMerged = await sanitizeMergedChatFileUrl(type, rawFu, cid, senderId, prevRow?.fileUrl);

    const next: StoredListingChatMessage = {
      id: mid,
      conversationId: cid,
      listingId: L,
      senderId,
      recipientId,
      text: textOut,
      createdAt,
      readAt: null,
      type,
      fileUrl: fileUrlMerged,
      fileName: typeof cm.fileName === "string" && cm.fileName.trim() ? cm.fileName.trim() : undefined,
      senderName: typeof cm.senderName === "string" && cm.senderName.trim() ? cm.senderName.trim() : undefined,
      replyToMessageId: typeof cm.replyToMessageId === "string" && cm.replyToMessageId.trim() ? cm.replyToMessageId.trim() : undefined,
      replyToText: typeof cm.replyToText === "string" && cm.replyToText.trim() ? cm.replyToText.trim() : undefined,
      editedAt: typeof cm.editedAt === "string" ? cm.editedAt : undefined,
    };

    const prev = prevRow;
    if (!prev) {
      byId.set(mid, next);
      continue;
    }
    byId.set(mid, {
      ...prev,
      ...next,
      createdAt: Math.min(prev.createdAt, createdAt),
      readAt: prev.readAt ?? next.readAt,
    });
  }

  conv.messages = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  const last = conv.messages[conv.messages.length - 1];
  if (last) {
    conv.lastMessageText = previewFromMessage(last);
    conv.lastMessageAt = last.createdAt;
  }
  conv.updatedAt = now;
  await writeDb(db);
}
