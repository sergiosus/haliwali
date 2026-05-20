/** Outbound search URLs only — no scraping, no server calls to third parties. */
export type ExternalMarketplaceSearchLink = {
  label: string;
  href: string;
};

function yandexSearch(text: string): string {
  return `https://yandex.ru/search/?text=${encodeURIComponent(text)}`;
}

function googleSearch(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Header suggest dropdown — same three neutral outbound search URLs (no external fetch).
 * @param q raw query (trimmed); use length ≥ 2 to match suggest threshold.
 */
export function getHeaderSuggestExternalSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const query = q.trim();
  if (query.length < 2) return [];
  return [
    { label: "Искать в Яндексе", href: yandexSearch(`${query} объявления`) },
    { label: "Искать в Google", href: googleSearch(query) },
    {
      label: "Искать на других сайтах",
      href: yandexSearch(`${query} объявления услуги товары`),
    },
  ];
}

/**
 * Safe outbound links — search engines only, no direct classifieds/marketplace URLs.
 */
export function getExternalMarketplaceSearchLinks(q: string): ExternalMarketplaceSearchLink[] {
  const query = q.trim();
  if (query.length < 1) return [];

  const out: ExternalMarketplaceSearchLink[] = [
    {
      label: "Искать в Яндексе",
      href: yandexSearch(`${query} объявления`),
    },
    {
      label: "Искать в Google",
      href: googleSearch(query),
    },
    {
      label: "Искать на других сайтах",
      href: yandexSearch(`${query} объявления услуги товары`),
    },
  ];

  return out;
}
