/**
 * Server-only AI chat summary helper. Does not log message text or prompts.
 */

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
  | { ok: true; summary: string }
  | { ok: false; code: "INSUFFICIENT" | "UNCONFIGURED" | "UPSTREAM"; message: string };

function logStage(stage: string, detail?: Record<string, string | number | boolean>) {
  if (detail) {
    console.error("[chat-ai-summary]", stage, detail);
  } else {
    console.error("[chat-ai-summary]", stage);
  }
}

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

const SYSTEM_PROMPT = `Ты помощник для краткого итога переписки между покупателем и продавцом на маркетплейсе.
Используй ТОЛЬКО факты из сообщений. Не выдумывай детали, цены, договорённости или имена, которых нет в переписке.
Если данных недостаточно для честного итога, ответь ровно одной строкой: INSUFFICIENT_DATA

Иначе ответь на русском языке строго в формате:

Основной вопрос:
<1–3 коротких предложения>

О чём договорились:
<пункты или «не зафиксировано», если в переписке этого нет>

Открытые вопросы:
<пункты или «нет»>

Рекомендуемый следующий шаг:
<одно конкретное действие на основе переписки>`;

function parseModelContent(raw: string): ChatAiSummaryResult {
  const text = raw.trim();
  if (!text || text === "INSUFFICIENT_DATA" || text.startsWith("INSUFFICIENT_DATA")) {
    return { ok: false, code: "INSUFFICIENT", message: INSUFFICIENT_RU };
  }
  return { ok: true, summary: text };
}

export async function generateChatAiSummary(messages: ChatSummarySourceMessage[]): Promise<ChatAiSummaryResult> {
  const lines = buildSummaryTranscript(messages);
  if (!hasEnoughContext(lines)) {
    return { ok: false, code: "INSUFFICIENT", message: INSUFFICIENT_RU };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    logStage("unconfigured");
    return {
      ok: false,
      code: "UNCONFIGURED",
      message: "Итог AI временно недоступен. Обратитесь к администратору сайта.",
    };
  }

  const model = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
  const transcript = lines.join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Переписка:\n\n${transcript}` },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      logStage("openai_http_error", { status: res.status });
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось сформировать итог. Попробуйте позже.",
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      logStage("openai_empty_response");
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось сформировать итог. Попробуйте позже.",
      };
    }

    return parseModelContent(content);
  } catch {
    logStage("openai_request_failed");
    return {
      ok: false,
      code: "UPSTREAM",
      message: "Не удалось сформировать итог. Попробуйте позже.",
    };
  }
}

export { INSUFFICIENT_RU };
