/**
 * Server-only AI chat summary helper. Does not log message text or prompts.
 */

import {
  type ChatAiCrmSummaryJson,
  formatChatAiCrmSummaryForDisplay,
  hasChatAiCrmSummaryContent,
  normalizeChatAiCrmSummaryJson,
} from "./chatAiCrmSummary";
import { callOpenAiChatCompletion } from "./serverChatAiOpenAi";

const INSUFFICIENT_RU = "Недостаточно данных для краткого итога.";
const MAX_MESSAGES = 40;
const MIN_LINES = 2;
const MIN_CHARS = 30;

export type ChatSummarySourceMessage = {
  createdAt: number;
  senderLabel: string;
  type?: "text" | "file";
  text?: string;
  fileName?: string;
  deletedForEveryone?: boolean;
};

export type ChatAiSummaryResult =
  | { ok: true; summary: string; structured: ChatAiCrmSummaryJson }
  | { ok: false; code: "INSUFFICIENT" | "UNCONFIGURED" | "UPSTREAM" | "PARSE"; message: string };

export function buildSummaryTranscript(messages: ChatSummarySourceMessage[]): string[] {
  const sorted = [...messages]
    .filter((m) => !m.deletedForEveryone)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES);

  const lines: string[] = [];
  for (const m of sorted) {
    const label = (m.senderLabel || "Участник").trim().slice(0, 80);
    const ts = new Date(m.createdAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    let body = "";
    if (m.type === "file") {
      const name = (m.fileName ?? "").trim();
      body = name ? `[вложение: ${name}]` : "[вложение]";
      const caption = (m.text ?? "").trim();
      if (caption) body += ` ${caption}`;
    } else {
      body = (m.text ?? "").trim();
    }
    if (!body) continue;
    lines.push(`[${ts}] ${label}: ${body.slice(0, 2000)}`);
  }
  return lines;
}

function hasEnoughContext(lines: string[]): boolean {
  if (lines.length < MIN_LINES) return false;
  const chars = lines.join("").replace(/\s/g, "").length;
  return chars >= MIN_CHARS;
}

const SYSTEM_PROMPT = `Ты CRM-аналитик переписки между покупателем и продавцом на маркетплейсе.
Используй ТОЛЬКО факты из сообщений. Не выдумывай детали, цены, договорённости или имена, которых нет в переписке.
Если данных недостаточно для честного анализа, ответь ровно: {"insufficient":true}

Иначе ответь ТОЛЬКО валидным JSON-объектом без markdown и без пояснений, строго с ключами:
{
  "clientGoal": "цель или запрос клиента",
  "problem": "проблема или суть запроса",
  "budget": "бюджет или цена, если упоминались, иначе пустая строка",
  "urgency": "срочность, если видна из переписки",
  "agreement": "о чём договорились или пустая строка",
  "nextStep": "рекомендуемый следующий шаг",
  "dealStage": "одно из: new, discussion, agreed, completed, canceled",
  "tags": ["короткие теги на русском или латинице, до 12 штук"]
}`;

function extractJsonObject(raw: string): unknown | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseModelContent(raw: string): ChatAiSummaryResult {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    console.error("[CHAT_AI_PARSE]", "invalid_json", { contentLength: raw.trim().length });
    return { ok: false, code: "PARSE", message: "Не удалось разобрать ответ AI." };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.insufficient === true) {
    return { ok: false, code: "INSUFFICIENT", message: INSUFFICIENT_RU };
  }

  const structured = normalizeChatAiCrmSummaryJson(parsed);
  if (!hasChatAiCrmSummaryContent(structured)) {
    return { ok: false, code: "INSUFFICIENT", message: INSUFFICIENT_RU };
  }

  console.error("[CHAT_AI_PARSE]", "ok", {
    dealStage: structured.dealStage,
    tagCount: structured.tags.length,
  });

  return {
    ok: true,
    structured,
    summary: formatChatAiCrmSummaryForDisplay(structured),
  };
}

export async function generateChatAiSummary(messages: ChatSummarySourceMessage[]): Promise<ChatAiSummaryResult> {
  const lines = buildSummaryTranscript(messages);
  if (!hasEnoughContext(lines)) {
    console.error("[CHAT_AI]", "insufficient_context", { lineCount: lines.length });
    return { ok: false, code: "INSUFFICIENT", message: INSUFFICIENT_RU };
  }

  const transcript = lines.join("\n");
  console.error("[CHAT_AI]", "request_start", { lineCount: lines.length });

  const ai = await callOpenAiChatCompletion({
    feature: "summary",
    system: SYSTEM_PROMPT,
    user: `Переписка:\n\n${transcript}`,
    maxTokens: 900,
    temperature: 0.2,
    jsonObject: true,
  });

  if (!ai.ok) {
    console.error("[CHAT_AI_ERROR]", "upstream", { code: ai.code });
    return {
      ok: false,
      code: ai.code,
      message:
        ai.code === "UNCONFIGURED"
          ? "Итог AI временно недоступен. Обратитесь к администратору сайта."
          : ai.message,
    };
  }

  return parseModelContent(ai.content);
}

export { INSUFFICIENT_RU };
