/**
 * Shared server-only chat AI completion helper. No prompt/message logging.
 *
 * Provider is selected with AI_PROVIDER:
 * - yandexgpt (default)
 * - gigachat
 * - openai (optional fallback, not the default)
 */

import { randomUUID } from "node:crypto";

export type ChatAiProvider = "yandexgpt" | "gigachat" | "openai";

export type ChatAiCallResult =
  | { ok: true; content: string }
  | { ok: false; code: "UNCONFIGURED" | "UPSTREAM"; message: string };

export type OpenAiCallResult = ChatAiCallResult;

type ChatAiCompletionInput = {
  feature: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  jsonObject?: boolean;
};

type OpenAiConfig = { apiKey: string; model: string };
type YandexGptConfig = { apiKey: string; folderId: string; model: string };
type GigaChatConfig = { authKey: string; scope: string; model: string };

let gigaTokenCache: { token: string; expiresAt: number } | null = null;

export function logChatAiStage(feature: string, stage: string, detail?: Record<string, string | number | boolean>) {
  if (detail) {
    console.error(`[chat-ai-${feature}]`, stage, detail);
  } else {
    console.error(`[chat-ai-${feature}]`, stage);
  }
}

function safeProvider(raw: string | undefined): ChatAiProvider {
  const p = raw?.trim().toLowerCase();
  if (p === "gigachat" || p === "openai" || p === "yandexgpt") return p;
  return "yandexgpt";
}

export function getChatAiProvider(): ChatAiProvider {
  return safeProvider(process.env.AI_PROVIDER);
}

export function getChatAiOpenAiConfig(): OpenAiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
  };
}

function getYandexGptConfig(): YandexGptConfig | null {
  const apiKey = process.env.YANDEX_GPT_API_KEY?.trim();
  const folderId = process.env.YANDEX_GPT_FOLDER_ID?.trim();
  if (!apiKey || !folderId) return null;
  return {
    apiKey,
    folderId,
    model: process.env.YANDEX_GPT_MODEL?.trim() || "yandexgpt-lite",
  };
}

function getGigaChatConfig(): GigaChatConfig | null {
  const authKey = process.env.GIGACHAT_AUTH_KEY?.trim();
  if (!authKey) return null;
  return {
    authKey,
    scope: process.env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS",
    model: process.env.GIGACHAT_MODEL?.trim() || "GigaChat",
  };
}

function unconfigured(input: ChatAiCompletionInput, provider: ChatAiProvider): ChatAiCallResult {
  logChatAiStage(input.feature, "unconfigured", { provider });
  return {
    ok: false,
    code: "UNCONFIGURED",
    message: "AI временно недоступен. Обратитесь к администратору сайта.",
  };
}

function upstream(input: ChatAiCompletionInput, provider: ChatAiProvider, stage: string, status?: number): ChatAiCallResult {
  logChatAiStage(input.feature, stage, {
    provider,
    ...(typeof status === "number" ? { status } : {}),
  });
  return {
    ok: false,
    code: "UPSTREAM",
    message: "Не удалось получить ответ AI. Попробуйте позже.",
  };
}

async function callOpenAiProvider(input: ChatAiCompletionInput): Promise<ChatAiCallResult> {
  const cfg = getChatAiOpenAiConfig();
  if (!cfg) {
    return unconfigured(input, "openai");
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
      return upstream(input, "openai", "openai_http_error", res.status);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return upstream(input, "openai", "openai_empty_response");
    }

    return { ok: true, content: content.trim() };
  } catch {
    return upstream(input, "openai", "openai_request_failed");
  }
}

async function callYandexGptProvider(input: ChatAiCompletionInput): Promise<ChatAiCallResult> {
  const cfg = getYandexGptConfig();
  if (!cfg) return unconfigured(input, "yandexgpt");

  try {
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modelUri: `gpt://${cfg.folderId}/${cfg.model}`,
        completionOptions: {
          stream: false,
          temperature: input.temperature ?? 0.35,
          maxTokens: String(input.maxTokens),
        },
        messages: [
          { role: "system", text: input.system },
          { role: "user", text: input.user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      return upstream(input, "yandexgpt", "yandexgpt_http_error", res.status);
    }

    const data = (await res.json()) as {
      result?: { alternatives?: Array<{ message?: { text?: string } }> };
    };
    const content = data.result?.alternatives?.[0]?.message?.text;
    if (typeof content !== "string" || !content.trim()) {
      return upstream(input, "yandexgpt", "yandexgpt_empty_response");
    }
    return { ok: true, content: content.trim() };
  } catch {
    return upstream(input, "yandexgpt", "yandexgpt_request_failed");
  }
}

async function getGigaChatToken(input: ChatAiCompletionInput, cfg: GigaChatConfig): Promise<string | null> {
  const now = Date.now();
  if (gigaTokenCache && gigaTokenCache.expiresAt - 60_000 > now) {
    return gigaTokenCache.token;
  }

  const res = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      Authorization: `Basic ${cfg.authKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: randomUUID(),
    },
    body: new URLSearchParams({ scope: cfg.scope }).toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    upstream(input, "gigachat", "gigachat_oauth_http_error", res.status);
    return null;
  }

  const data = (await res.json()) as { access_token?: string; expires_at?: number };
  const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
  if (!token) {
    upstream(input, "gigachat", "gigachat_oauth_empty_token");
    return null;
  }

  gigaTokenCache = {
    token,
    expiresAt: typeof data.expires_at === "number" && data.expires_at > now ? data.expires_at : now + 25 * 60_000,
  };
  return token;
}

async function callGigaChatProvider(input: ChatAiCompletionInput): Promise<ChatAiCallResult> {
  const cfg = getGigaChatConfig();
  if (!cfg) return unconfigured(input, "gigachat");

  try {
    const token = await getGigaChatToken(input, cfg);
    if (!token) {
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось получить ответ AI. Попробуйте позже.",
      };
    }

    const res = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
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
      return upstream(input, "gigachat", "gigachat_http_error", res.status);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return upstream(input, "gigachat", "gigachat_empty_response");
    }
    return { ok: true, content: content.trim() };
  } catch {
    return upstream(input, "gigachat", "gigachat_request_failed");
  }
}

export async function callChatAiCompletion(input: ChatAiCompletionInput): Promise<ChatAiCallResult> {
  const provider = getChatAiProvider();
  if (provider === "gigachat") return callGigaChatProvider(input);
  if (provider === "openai") return callOpenAiProvider(input);
  return callYandexGptProvider(input);
}

/** Backward-compatible export for existing chat AI helpers. */
export async function callOpenAiChatCompletion(input: ChatAiCompletionInput): Promise<OpenAiCallResult> {
  return callChatAiCompletion(input);
}
