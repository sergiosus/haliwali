/** Outbound search URLs only — no scraping, no server calls to third parties. */
import { normalizeGlobalSearchQuery } from "./globalSearchNormalize";

export type ExternalMarketplaceSearchLink = {
  label: string;
  href: string;
};

const YANDEX_MARKETPLACE_SITES: readonly { host: string; label: string }[] = [
  { host: "avito.ru", label: "Авито через Яндекс" },
  { host: "youla.ru", label: "Юла через Яндекс" },
  { host: "drom.ru", label: "Дром через Яндекс" },
  { host: "irr.ru", label: "IRR через Яндекс" },
];

/** Plain Yandex web search: `?text=<encoded query>`. */
function yandexSearchText(text: string): string {
  return `https://yandex.ru/search/?text=${encodeURIComponent(text)}`;
}

/** Plain Google web search: `?q=<encoded query>`. */
function googleSearchQuery(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Query string for outbound links — same normalization as Haliwali search
 * (EN keyboard → RU, Latin typing → RU, collapsed spaces).
 */
export function externalSearchQueryText(raw: string): string {
  const n = normalizeGlobalSearchQuery(raw);
  if (n.keyboardFixed && /[\u0400-\u04FF]/.test(n.keyboardFixed)) return n.keyboardFixed;
  if (n.transliterated && /[\u0400-\u04FF]/.test(n.transliterated)) return n.transliterated;
  if (n.primary) return n.primary;
  return n.original.trim();
}

function yandexSiteSearch(host: string, rawQuery: string): string {
  const q = externalSearchQueryText(rawQuery);
  const text = `site:${host} ${q}`.replace(/\s+/g, " ").trim();
  return yandexSearchText(text);
}

/** One Yandex link per marketplace (`site:domain <query>`). */
export function getYandexMarketplaceSiteLinks(raw: string): ExternalMarketplaceSearchLink[] {
  const q = externalSearchQueryText(raw);
  if (!q) return [];
  return YANDEX_MARKETPLACE_SITES.map(({ host, label }) => ({
    label,
    href: yandexSiteSearch(host, raw),
  }));
}

/**
 * Header suggest dropdown — Yandex, Google, then per-site Yandex links.
 * @param q raw query (trimmed); use length ≥ 2 to match suggest threshold.
 */
export function getHeaderSuggestExternalSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const original = (q ?? "").trim();
  if (original.length < 2) return [];
  const query = externalSearchQueryText(original);
  return [
    { label: "Искать в Яндексе", href: yandexSearchText(query) },
    { label: "Искать в Google", href: googleSearchQuery(query) },
    ...getYandexMarketplaceSiteLinks(original),
  ];
}

/**
 * `/search` page — Yandex, Google, and per-site Yandex links (no embedded results).
 */
export function getExternalMarketplaceSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const original = (q ?? "").trim();
  if (original.length < 1) return [];
  const query = externalSearchQueryText(original);
  return [
    { label: "Искать в Яндексе", href: yandexSearchText(query) },
    { label: "Искать в Google", href: googleSearchQuery(query) },
    ...getYandexMarketplaceSiteLinks(original),
  ];
}
