import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const DATA_DIR = path.join(process.cwd(), ".data");
const CHAT_CRM_PATH = path.join(DATA_DIR, "chat-crm-fields.json");

export const CHAT_CRM_STATUSES = ["new", "in_progress", "waiting", "done"] as const;
export type ChatCrmStatus = (typeof CHAT_CRM_STATUSES)[number];

export type ChatCrmRecord = {
  conversationId: string;
  userId: string;
  status: ChatCrmStatus;
  privateNote: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

type JsonFile = { records: Record<string, ChatCrmRecord> };

function key(conversationId: string, userId: string): string {
  return `${userId.trim()}::${conversationId.trim()}`;
}

export function normalizeChatCrmStatus(raw: unknown): ChatCrmStatus {
  return CHAT_CRM_STATUSES.includes(raw as ChatCrmStatus) ? (raw as ChatCrmStatus) : "new";
}

function normalizePrivateNote(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 4000) : "";
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function defaultRecord(conversationId: string, userId: string): ChatCrmRecord {
  const now = Date.now();
  return {
    conversationId,
    userId,
    status: "new",
    privateNote: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function readJson(): Promise<JsonFile> {
  try {
    const raw = await readFile(CHAT_CRM_PATH, "utf8");
    const parsed = JSON.parse(raw) as JsonFile;
    if (!parsed || typeof parsed !== "object" || !parsed.records || typeof parsed.records !== "object") {
      return { records: {} };
    }
    return { records: parsed.records };
  } catch {
    return { records: {} };
  }
}

async function writeJson(data: JsonFile): Promise<void> {
  assertFileStoreNotUsedInProduction("chat_crm_fields");
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CHAT_CRM_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function getChatCrmRecord(conversationIdRaw: string, userIdRaw: string): Promise<ChatCrmRecord> {
  const conversationId = conversationIdRaw.trim();
  const userId = userIdRaw.trim();
  if (!conversationId || !userId) return defaultRecord(conversationId, userId);

  if (usesPostgres()) {
    const pool = getPool();
    const { rows } = await pool.query<{
      conversation_id: string;
      user_id: string;
      status: string;
      private_note: string | null;
      tags: string[] | null;
      created_at: string | number;
      updated_at: string | number;
    }>(
      `SELECT conversation_id, user_id, status, private_note, tags, created_at, updated_at
       FROM chat_crm_fields
       WHERE conversation_id = $1 AND user_id = $2
       LIMIT 1`,
      [conversationId, userId],
    );
    const row = rows[0];
    if (!row) return defaultRecord(conversationId, userId);
    return {
      conversationId: row.conversation_id,
      userId: row.user_id,
      status: normalizeChatCrmStatus(row.status),
      privateNote: row.private_note ?? "",
      tags: normalizeTags(row.tags ?? []),
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  const db = await readJson();
  return db.records[key(conversationId, userId)] ?? defaultRecord(conversationId, userId);
}

export async function upsertChatCrmRecord(
  conversationIdRaw: string,
  userIdRaw: string,
  patch: { status?: unknown; privateNote?: unknown; tags?: unknown },
): Promise<ChatCrmRecord> {
  const conversationId = conversationIdRaw.trim();
  const userId = userIdRaw.trim();
  const current = await getChatCrmRecord(conversationId, userId);
  const now = Date.now();
  const next: ChatCrmRecord = {
    ...current,
    status: patch.status === undefined ? current.status : normalizeChatCrmStatus(patch.status),
    privateNote: patch.privateNote === undefined ? current.privateNote : normalizePrivateNote(patch.privateNote),
    tags: patch.tags === undefined ? current.tags : normalizeTags(patch.tags),
    updatedAt: now,
  };

  if (usesPostgres()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO chat_crm_fields (conversation_id, user_id, status, private_note, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET status = EXCLUDED.status,
                     private_note = EXCLUDED.private_note,
                     tags = EXCLUDED.tags,
                     updated_at = EXCLUDED.updated_at`,
      [conversationId, userId, next.status, next.privateNote, next.tags, next.createdAt, next.updatedAt],
    );
    return next;
  }

  const db = await readJson();
  db.records[key(conversationId, userId)] = next;
  await writeJson(db);
  return next;
}
