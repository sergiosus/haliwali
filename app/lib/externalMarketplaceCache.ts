/**
 * Short-lived in-memory cache for marketplace aggregation (per server instance).
 */

import type { MarketplaceAggregationResult } from "./externalMarketplaceAggregation";

type CacheEntry = {
  expiresAt: number;
  result: MarketplaceAggregationResult;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

export type MarketplaceCacheOpts = {
  maxCards: number;
  includeAuto: boolean;
  includeRestricted: boolean;
  scope?: "default" | "page";
  providerFilter?: string;
};

function cacheKey(normalizedQuery: string, opts: MarketplaceCacheOpts): string {
  const scope = opts.scope ?? "default";
  const pf = opts.providerFilter ?? "all";
  return `${scope}|${pf}|${normalizedQuery}|${opts.maxCards}|${opts.includeAuto ? 1 : 0}|${opts.includeRestricted ? 1 : 0}`;
}

export function readMarketplaceCache(
  normalizedQuery: string,
  opts: MarketplaceCacheOpts,
): MarketplaceAggregationResult | null {
  const key = cacheKey(normalizedQuery, opts);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

export function writeMarketplaceCache(
  normalizedQuery: string,
  opts: MarketplaceCacheOpts,
  result: MarketplaceAggregationResult,
): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  const key = cacheKey(normalizedQuery, opts);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}
