/** Outbound search URLs only — no scraping, no server calls to third parties. */
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
 * Yandex search restricted to major listing domains — single `text` param, fully URL-encoded.
 * Example (decoded): (site:avito.ru OR site:youla.ru OR site:irr.ru OR site:drom.ru) ремонт холодильников
 */
const YANDEX_MARKETPLACE_SITE_SCOPE =
  "(site:avito.ru OR site:youla.ru OR site:irr.ru OR site:drom.ru)";

function yandexOtherSitesSearchUrl(query: string): string {
  const t = query.trim();
  const text = `${YANDEX_MARKETPLACE_SITE_SCOPE} ${t}`.replace(/\s+/g, " ").trim();
  return yandexSearchText(text);
}

/**
 * Header suggest dropdown — three outbound `<a href>` targets only.
 * @param q raw query (trimmed); use length ≥ 2 to match suggest threshold.
 */
export function getHeaderSuggestExternalSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const query = q.trim();
  if (query.length < 2) return [];
  return [
    { label: "Искать в Яндексе", href: yandexSearchText(query) },
    { label: "Искать в Google", href: googleSearchQuery(query) },
    {
      label: "Искать на других сайтах",
      href: yandexOtherSitesSearchUrl(query),
    },
  ];
}

/**
 * `/search` page — same three URLs as header (no embedded results).
 */
export function getExternalMarketplaceSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const query = q.trim();
  if (query.length < 1) return [];

  return [
    {
      label: "Искать в Яндексе",
      href: yandexSearchText(query),
    },
    {
      label: "Искать в Google",
      href: googleSearchQuery(query),
    },
    {
      label: "Искать на других сайтах",
      href: yandexOtherSitesSearchUrl(query),
    },
  ];
}
