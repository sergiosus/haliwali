import type { OfferSearchResponse } from "./catalogOfferAdminSearch";
import { logCatalogOfferSearch } from "./catalogCatalogLog";

const TTL_MS = 30 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  value: OfferSearchResponse;
};

const cache = new Map<string, CacheEntry>();

export type OfferSearchCacheKey = {
  query: string;
  city: string;
  brand: string;
  oemArticle: string;
  sourceFilter: string;
  categorySlug: string;
  priceMin?: number;
  priceMax?: number;
  sort: string;
};

function stableKey(parts: OfferSearchCacheKey): string {
  return JSON.stringify({
    q: parts.query.trim().toLowerCase(),
    city: parts.city.trim().toLowerCase(),
    brand: parts.brand.trim().toLowerCase(),
    oem: parts.oemArticle.trim().toLowerCase(),
    source: parts.sourceFilter,
    cat: parts.categorySlug,
    pmin: parts.priceMin ?? null,
    pmax: parts.priceMax ?? null,
    sort: parts.sort,
  });
}

export function getCachedOfferSearch(key: OfferSearchCacheKey): OfferSearchResponse | null {
  const k = stableKey(key);
  const entry = cache.get(k);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(k);
    return null;
  }
  logCatalogOfferSearch("search_cache_hit", { query: key.query.slice(0, 40) });
  return entry.value;
}

export function setCachedOfferSearch(key: OfferSearchCacheKey, value: OfferSearchResponse): void {
  const k = stableKey(key);
  cache.set(k, { expiresAt: Date.now() + TTL_MS, value });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function clearOfferSearchCache(): void {
  cache.clear();
}
