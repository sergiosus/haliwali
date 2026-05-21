/** Outbound search URLs only — no scraping, no server calls to third parties. */
import { bestGlobalSearchQueryText } from "./globalSearchNormalize";

export type ExternalMarketplaceSearchLink = {
  label: string;
  href: string;
};

/** Plain Yandex web search: `?text=<encoded query>`. */
function yandexSearchText(text: string): string {
  return `https://yandex.ru/search/?text=${encodeURIComponent(text)}`;
}

/** Plain Google web search: `?q=<encoded query>`. */
function googleSearchQuery(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Query string for outbound links — EN QWERTY → RU ЙЦУКЕН and other normalized variants.
 */
export function externalSearchQueryText(raw: string): string {
  return bestGlobalSearchQueryText(raw);
}

function yandexAndGoogleLinks(raw: string): ExternalMarketplaceSearchLink[] {
  const original = (raw ?? "").trim();
  if (!original) return [];
  const query = externalSearchQueryText(original);
  if (!query) return [];
  return [
    { label: "Искать в Яндексе", href: yandexSearchText(query) },
    { label: "Искать в Google", href: googleSearchQuery(query) },
  ];
}

/**
 * Header suggest dropdown — Yandex and Google only.
 * @param q raw query (trimmed); use length ≥ 2 to match suggest threshold.
 */
export function getHeaderSuggestExternalSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const original = (q ?? "").trim();
  if (original.length < 2) return [];
  return yandexAndGoogleLinks(original);
}

/** `/search` page — Yandex and Google only. */
export function getExternalMarketplaceSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const original = (q ?? "").trim();
  if (original.length < 1) return [];
  return yandexAndGoogleLinks(original);
}
