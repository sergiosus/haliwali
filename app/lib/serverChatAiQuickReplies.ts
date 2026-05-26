import { buildSummaryTranscript } from "./serverChatAiSummary";
import type { ChatAiConversationBundle } from "./serverChatAiConversation";
import { callOpenAiChatCompletion } from "./serverChatAiOpenAi";

const MAX_REPLY_LEN = 280;

export type ChatAiQuickRepliesResult =
  | { ok: true; replies: [string, string, string] }
  | { ok: false; code: "INSUFFICIENT" | "UNCONFIGURED" | "UPSTREAM"; message: string };

const SYSTEM_PROMPT = `Ты помощник для быстрых ответов в чате маркетплейса Haliwali.
Сгенерируй ровно 3 коротких вежливых варианта ответа на русском языке для пользователя, который сейчас будет отправлять сообщение.
Стиль: деловой, дружелюбный, как на Avito/маркетплейсе.

Правила:
- НЕ выдумывай цены, скидки, гарантии, адреса, телефоны, условия доставки или оплаты.
- Используй только факты из переписки и безопасного контекста объявления/компании.
- Если данных мало — хотя бы один вариант должен быть уточняющим вопросом (без выдуманных деталей).
- Каждый вариант — одно сообщение, без нумерации и кавычек внутри текста.

Ответ строго JSON: {"replies":["...","...","..."]}`;

function sanitizeReply(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_REPLY_LEN);
}

function parseRepliesJson(raw: string): [string, string, string] | null {
  try {
    const parsed = JSON.parse(raw) as { replies?: unknown };
    if (!Array.isArray(parsed.replies) || parsed.replies.length < 3) return null;
    const a = sanitizeReply(parsed.replies[0]);
    const b = sanitizeReply(parsed.replies[1]);
    const c = sanitizeReply(parsed.replies[2]);
    if (!a || !b || !c) return null;
    return [a, b, c];
  } catch {
    return null;
  }
}

function buildContextBlock(bundle: ChatAiConversationBundle, currentUserId: string): string {
  const parts: string[] = [];

  if (bundle.listingContext) {
    const lc = bundle.listingContext;
    parts.push(`Объявление: ${lc.title}`);
    if (lc.city) parts.push(`Город: ${lc.city}`);
    if (lc.category) parts.push(`Категория: ${lc.category}`);
    if (typeof lc.price === "number") {
      parts.push(`Цена в объявлении: ${Intl.NumberFormat("ru-RU").format(lc.price)} ₽`);
    }
  } else if (bundle.companyTitle) {
    parts.push(`Компания: ${bundle.companyTitle}`);
  }

  let role = "участник переписки";
  if (bundle.listingOwnerId && currentUserId === bundle.listingOwnerId) {
    role = "продавец (владелец объявления)";
  } else if (bundle.buyerId && currentUserId === bundle.buyerId) {
    role = "покупатель";
  } else if (bundle.companyOwnerId && currentUserId === bundle.companyOwnerId) {
    role = "представитель компании";
  } else if (bundle.companyCustomerId && currentUserId === bundle.companyCustomerId) {
    role = "клиент компании";
  }
  parts.push(`Отвечает: ${role}`);

  const lines = buildSummaryTranscript(bundle.messages);
  if (lines.length > 0) {
    parts.push("");
    parts.push("Переписка:");
    parts.push(lines.join("\n"));
  }

  return parts.join("\n");
}

function hasMinimalContext(bundle: ChatAiConversationBundle): boolean {
  const lines = buildSummaryTranscript(bundle.messages);
  const hasTranscript = lines.length >= 1 && lines.join("").replace(/\s/g, "").length >= 15;
  const hasListing = Boolean(bundle.listingContext?.title?.trim());
  const hasCompany = Boolean(bundle.companyTitle?.trim());
  return hasTranscript || hasListing || hasCompany;
}

function fallbackClarifyingReplies(bundle: ChatAiConversationBundle): [string, string, string] {
  if (bundle.listingContext?.title) {
    const t = bundle.listingContext.title.slice(0, 80);
    return [
      "Здравствуйте! Уточните, пожалуйста, что именно вас интересует по объявлению?",
      `По «${t}» — когда вам удобно обсудить детали?`,
      "Спасибо за сообщение! Могу ответить на ваши вопросы.",
    ];
  }
  if (bundle.companyTitle) {
    return [
      "Здравствуйте! Чем могу помочь?",
      "Уточните, пожалуйста, ваш вопрос — постараюсь ответить.",
      "Спасибо за обращение! Что именно вас интересует?",
    ];
  }
  return [
    "Здравствуйте! Уточните, пожалуйста, ваш вопрос.",
    "Спасибо за сообщение! Чем могу помочь?",
    "Могу уточнить детали — напишите, что вас интересует.",
  ];
}

export async function generateChatAiQuickReplies(
  bundle: ChatAiConversationBundle,
  currentUserId: string,
): Promise<ChatAiQuickRepliesResult> {
  if (!hasMinimalContext(bundle)) {
    return {
      ok: false,
      code: "INSUFFICIENT",
      message: "Недостаточно данных для подсказок. Напишите уточняющий вопрос вручную.",
    };
  }

  const userContent = buildContextBlock(bundle, currentUserId);
  const ai = await callOpenAiChatCompletion({
    feature: "quick-replies",
    system: SYSTEM_PROMPT,
    user: userContent,
    maxTokens: 450,
    temperature: 0.4,
    jsonObject: true,
  });

  if (!ai.ok) {
    return { ok: false, code: ai.code, message: ai.message };
  }

  const parsed = parseRepliesJson(ai.content);
  if (parsed) {
    return { ok: true, replies: parsed };
  }

  // Safe fallback when model JSON is malformed but we have some context
  return { ok: true, replies: fallbackClarifyingReplies(bundle) };
}
