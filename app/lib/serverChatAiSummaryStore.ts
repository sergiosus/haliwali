import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type ChatAiCrmSummaryJson,
  EMPTY_CHAT_AI_CRM_SUMMARY,
  formatChatAiCrmSummaryForDisplay,
  normalizeChatAiCrmSummaryJson,
} from "./chatAiCrmSummary";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const DATA_DIR = path.join(process.cwd(), ".data");
const SUMMARIES_PATH = path.join(DATA_DIR, "chat-ai-summaries.json");

type JsonFile = {
  items: Array<{
    id: string;
    conversationId: string;
    userId: string;
    summaryText: string;
    summaryJson?: ChatAiCrmSummaryJson;
    createdAt: number;
    updatedAt: number;
  }>;
};

async function readJson(): Promise<JsonFile> {
  try {
    const raw = await readFile(SUMMARIES_PATH, "utf8");
    const parsed = JSON.parse(raw) as JsonFile;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return { items: [] };
    }
    return parsed;
  } catch {
    return { items: [] };
  }
}

async function writeJson(data: JsonFile): Promise<void> {
  assertFileStoreNotUsedInProduction("chat_ai_summaries");
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SUMMARIES_PATH, JSON.stringify(data, null, 2), "utf8");
}

export type ChatAiSummaryListItem = {
  conversationId: string;
  summaryText: string;
  createdAt: number;
};

export type ChatAiSummaryRecord = {
  id: string;
  chatId: string;
  summaryJson: ChatAiCrmSummaryJson;
  summaryText: string;
  createdAt: number;
  updatedAt: number;
};

function rowToRecord(row: {
  id: string | number;
  conversation_id: string;
  summary_text: string;
  summary_json: unknown;
  created_at: string | number;
  updated_at: string | number | null;
}): ChatAiSummaryRecord | null {
  const structured =
    row.summary_json && typeof row.summary_json === "object"
      ? normalizeChatAiCrmSummaryJson(row.summary_json)
      : null;
  const summaryText =
    (row.summary_text ?? "").trim() ||
    (structured ? formatChatAiCrmSummaryForDisplay(structured) : "");
  if (!structured && !summaryText) return null;
  return {
    id: String(row.id),
    chatId: row.conversation_id,
    summaryJson: structured ?? EMPTY_CHAT_AI_CRM_SUMMARY,
    summaryText,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at ?? row.created_at) || 0,
  };
}

export async function getLatestChatAiSummaryForUser(
  conversationIdRaw: string,
  userIdRaw: string,
): Promise<ChatAiSummaryRecord | null> {
  const conversationId = conversationIdRaw.trim();
  const userId = userIdRaw.trim();
  if (!conversationId || !userId) return null;

  if (usesPostgres()) {
    try {
      const { rows } = await getPool().query<{
        id: string;
        conversation_id: string;
        summary_text: string;
        summary_json: unknown;
        created_at: string | number;
        updated_at: string | number | null;
      }>(
        `SELECT id, conversation_id, summary_text, summary_json, created_at, updated_at
         FROM chat_ai_summaries
         WHERE conversation_id = $1 AND user_id = $2
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT 1`,
        [conversationId, userId],
      );
      const row = rows[0];
      return row ? rowToRecord(row) : null;
    } catch (e) {
      console.error("[CHAT_AI_ERROR]", "pg_load_failed", {
        hasConversationId: Boolean(conversationId),
      });
      return null;
    }
  }

  try {
    const file = await readJson();
    let best: (typeof file.items)[number] | null = null;
    for (const item of file.items) {
      if (item.conversationId !== conversationId || item.userId !== userId) continue;
      const at = item.updatedAt || item.createdAt;
      const bestAt = best ? best.updatedAt || best.createdAt : 0;
      if (!best || at > bestAt) best = item;
    }
    if (!best) return null;
    const structured = best.summaryJson
      ? normalizeChatAiCrmSummaryJson(best.summaryJson)
      : EMPTY_CHAT_AI_CRM_SUMMARY;
    const summaryText = best.summaryText.trim() || formatChatAiCrmSummaryForDisplay(structured);
    return {
      id: best.id,
      chatId: best.conversationId,
      summaryJson: structured,
      summaryText,
      createdAt: best.createdAt,
      updatedAt: best.updatedAt || best.createdAt,
    };
  } catch {
    return null;
  }
}

export async function listUserChatAiSummaries(userIdRaw: string, limit = 24): Promise<ChatAiSummaryListItem[]> {
  const userId = userIdRaw.trim();
  if (!userId) return [];
  const cap = Math.min(Math.max(limit, 1), 48);

  if (usesPostgres()) {
    try {
      const { rows } = await getPool().query<{
        conversation_id: string;
        summary_text: string;
        created_at: string | number;
        updated_at: string | number | null;
      }>(
        `SELECT DISTINCT ON (conversation_id) conversation_id, summary_text, created_at, updated_at
         FROM chat_ai_summaries
         WHERE user_id = $1
         ORDER BY conversation_id, COALESCE(updated_at, created_at) DESC`,
        [userId],
      );
      return rows
        .map((row) => ({
          conversationId: row.conversation_id,
          summaryText: row.summary_text,
          createdAt: Number(row.updated_at ?? row.created_at) || 0,
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, cap);
    } catch {
      return [];
    }
  }

  try {
    const file = await readJson();
    const latest = new Map<string, ChatAiSummaryListItem>();
    for (const item of file.items) {
      if (item.userId.trim() !== userId) continue;
      const at = item.updatedAt || item.createdAt;
      const prev = latest.get(item.conversationId);
      if (!prev || at > prev.createdAt) {
        latest.set(item.conversationId, {
          conversationId: item.conversationId,
          summaryText: item.summaryText,
          createdAt: at,
        });
      }
    }
    return [...latest.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
  } catch {
    return [];
  }
}

export async function saveChatAiSummary(input: {
  conversationId: string;
  userId: string;
  summaryText: string;
  summaryJson?: ChatAiCrmSummaryJson;
}): Promise<{ ok: true; id: string } | { ok: false; code: "STORAGE_UNAVAILABLE" }> {
  const conversationId = input.conversationId.trim();
  const userId = input.userId.trim();
  const structured = input.summaryJson
    ? normalizeChatAiCrmSummaryJson(input.summaryJson)
    : null;
  const summaryText = (
    input.summaryText.trim() ||
    (structured ? formatChatAiCrmSummaryForDisplay(structured) : "")
  ).slice(0, 12_000);
  if (!conversationId || !userId || !summaryText) {
    return { ok: false, code: "STORAGE_UNAVAILABLE" };
  }

  const now = Date.now();
  const summaryJson = structured ?? EMPTY_CHAT_AI_CRM_SUMMARY;

  if (usesPostgres()) {
    const pool = getPool();
    const params = [conversationId, userId, summaryText, JSON.stringify(summaryJson), now] as const;
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO chat_ai_summaries (
           conversation_id, user_id, summary_text, summary_json, created_at, updated_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $5)
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET
           summary_text = EXCLUDED.summary_text,
           summary_json = EXCLUDED.summary_json,
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [...params],
      );
      const id = rows[0]?.id ? String(rows[0].id) : `cas_${now}`;
      console.error("[CHAT_AI_SAVE]", "ok", {
        hasConversationId: Boolean(conversationId),
        hasStructured: Boolean(structured),
      });
      return { ok: true, id };
    } catch {
      try {
        const updated = await pool.query<{ id: string }>(
          `UPDATE chat_ai_summaries
           SET summary_text = $3, summary_json = $4::jsonb, updated_at = $5
           WHERE conversation_id = $1 AND user_id = $2
           RETURNING id`,
          [...params],
        );
        if (updated.rowCount && updated.rowCount > 0) {
          const id = updated.rows[0]?.id ? String(updated.rows[0].id) : `cas_${now}`;
          console.error("[CHAT_AI_SAVE]", "ok_update", { hasConversationId: Boolean(conversationId) });
          return { ok: true, id };
        }
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO chat_ai_summaries (
             conversation_id, user_id, summary_text, summary_json, created_at, updated_at
           ) VALUES ($1, $2, $3, $4::jsonb, $5, $5)
           RETURNING id`,
          [...params],
        );
        const id = inserted.rows[0]?.id ? String(inserted.rows[0].id) : `cas_${now}`;
        console.error("[CHAT_AI_SAVE]", "ok_insert", { hasConversationId: Boolean(conversationId) });
        return { ok: true, id };
      } catch {
        console.error("[CHAT_AI_ERROR]", "pg_save_failed", {
          hasConversationId: Boolean(conversationId),
        });
        return { ok: false, code: "STORAGE_UNAVAILABLE" };
      }
    }
  }

  const id = `cas_${now}_${randomBytes(4).toString("hex")}`;
  try {
    const file = await readJson();
    const idx = file.items.findIndex(
      (x) => x.conversationId === conversationId && x.userId === userId,
    );
    const row = {
      id,
      conversationId,
      userId,
      summaryText,
      summaryJson,
      createdAt: idx >= 0 ? file.items[idx]!.createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) file.items[idx] = row;
    else file.items.push(row);
    await writeJson(file);
    console.error("[CHAT_AI_SAVE]", "ok", { hasConversationId: Boolean(conversationId) });
    return { ok: true, id };
  } catch {
    console.error("[CHAT_AI_ERROR]", "json_save_failed");
    return { ok: false, code: "STORAGE_UNAVAILABLE" };
  }
}
