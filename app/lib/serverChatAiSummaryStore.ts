import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
    createdAt: number;
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

export async function saveChatAiSummary(input: {
  conversationId: string;
  userId: string;
  summaryText: string;
}): Promise<{ ok: true; id: string } | { ok: false; code: "STORAGE_UNAVAILABLE" }> {
  const conversationId = input.conversationId.trim();
  const userId = input.userId.trim();
  const summaryText = input.summaryText.trim().slice(0, 12_000);
  if (!conversationId || !userId || !summaryText) {
    return { ok: false, code: "STORAGE_UNAVAILABLE" };
  }

  const createdAt = Date.now();
  const id = `cas_${createdAt}_${randomBytes(4).toString("hex")}`;

  if (usesPostgres()) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO chat_ai_summaries (conversation_id, user_id, summary_text, created_at)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, userId, summaryText, createdAt],
      );
      return { ok: true, id };
    } catch (e) {
      console.error("[chat-ai-summary]", "pg_save_failed", {
        hasConversationId: Boolean(conversationId),
      });
      return { ok: false, code: "STORAGE_UNAVAILABLE" };
    }
  }

  try {
    const file = await readJson();
    file.items.push({ id, conversationId, userId, summaryText, createdAt });
    await writeJson(file);
    return { ok: true, id };
  } catch {
    console.error("[chat-ai-summary]", "json_save_failed");
    return { ok: false, code: "STORAGE_UNAVAILABLE" };
  }
}
