"use client";

import type { Listing } from "./listings";

export type ModerationDecision =
  | { status: "auto"; moderationReason?: string }
  | { status: "pending"; moderationReason: string };

const FORBIDDEN_WORDS = [
  "наркотики",
  "закладки",
  "соль",
  "меф",
  "мефедрон",
  "оружие",
  "пистолет",
  "автомат",
  "патроны",
  "взрывчатка",
  "интим",
  "эскорт",
  "проституция",
  "порнография",
  "паспорт купить",
  "права купить",
  "справка купить",
  "обнал",
  "пробив",
  "базы данных",
  "банковские карты",
  "сим-карты",
] as const;

const SPAM_PHRASES = [
  "казино",
  "ставки",
  "займ",
  "кредит",
  "быстро деньги",
  "заработок без вложений",
  "крипта",
  "инвестиции",
] as const;

function normalizeText(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasSuspiciousLinks(text: string) {
  return /(https?:\/\/|www\.|t\.me|vk\.com|wa\.me)/i.test(text);
}

function hasTooManyRepeatedChars(text: string) {
  // e.g. "аааааааа", "!!!!!!", "0000000"
  return /(.)\1{6,}/.test(text);
}

/**
 * Auto moderation for MVP.
 * - Returns "auto" for clean listings that can be published immediately.
 * - Returns "pending" for suspicious/low-quality listings that need review.
 */
export function moderateListing(listing: Pick<Listing, "title" | "description" | "phone" | "city" | "categoryName">): ModerationDecision {
  const title = (listing.title ?? "").trim();
  const description = (listing.description ?? "").trim();

  const text = normalizeText(`${title} ${description}`);

  if (hasSuspiciousLinks(text)) {
    return { status: "pending", moderationReason: "Подозрительные ссылки в тексте" };
  }
  if (hasTooManyRepeatedChars(text)) {
    return { status: "pending", moderationReason: "Подозрительные повторяющиеся символы" };
  }

  const forbidden = FORBIDDEN_WORDS.find((w) => text.includes(w));
  if (forbidden) {
    return { status: "pending", moderationReason: "Подозрительные или запрещённые слова в тексте" };
  }

  const spam = SPAM_PHRASES.find((w) => text.includes(w));
  if (spam) {
    return { status: "pending", moderationReason: "Похоже на спам или рекламу" };
  }

  return { status: "auto", moderationReason: "" };
}

