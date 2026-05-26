/**
 * Shared OpenAI chat completion helper for chat AI features. No prompt/message logging.
 */

export type OpenAiCallResult =
  | { ok: true; content: string }
  | { ok: false; code: "UNCONFIGURED" | "UPSTREAM"; message: string };

export function logChatAiStage(feature: string, stage: string, detail?: Record<string, string | number | boolean>) {
  if (detail) {
    console.error(`[chat-ai-${feature}]`, stage, detail);
  } else {
    console.error(`[chat-ai-${feature}]`, stage);
  }
}

export function getChatAiOpenAiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
  };
}

export async function callOpenAiChatCompletion(input: {
  feature: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<OpenAiCallResult> {
  const cfg = getChatAiOpenAiConfig();
  if (!cfg) {
    logChatAiStage(input.feature, "unconfigured");
    return {
      ok: false,
      code: "UNCONFIGURED",
      message: "AI временно недоступен. Обратитесь к администратору сайта.",
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens,
        ...(input.jsonObject ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      logChatAiStage(input.feature, "openai_http_error", { status: res.status });
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось получить ответ AI. Попробуйте позже.",
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      logChatAiStage(input.feature, "openai_empty_response");
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось получить ответ AI. Попробуйте позже.",
      };
    }

    return { ok: true, content: content.trim() };
  } catch {
    logChatAiStage(input.feature, "openai_request_failed");
    return {
      ok: false,
      code: "UPSTREAM",
      message: "Не удалось получить ответ AI. Попробуйте позже.",
    };
  }
}
