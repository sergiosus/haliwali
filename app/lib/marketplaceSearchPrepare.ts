/**
 * Smart gateway query preparation — layout fix, translit, deduped variants for URLs/cache.
 */

import {
  bestGlobalSearchQueryText,
  globalSearchNormalizedPayload,
  normalizeGlobalSearchQuery,
  type GlobalSearchNormalizedQuery,
} from "./globalSearchNormalize";

export type MarketplacePreparedQuery = {
  original: string;
  /** Best text for provider search URLs and outbound links. */
  normalizedQuery: string;
  keyboardFixed: string | null;
  transliterated: string | null;
  /** Deduped variants (primary, keyboard, translit) for future APIs / cache keys. */
  variants: string[];
};

export function prepareMarketplaceGatewayQuery(raw: string): MarketplacePreparedQuery {
  const n = normalizeGlobalSearchQuery(raw);
  const normalizedQuery = bestGlobalSearchQueryText(raw) || n.primary || n.original;
  return {
    original: n.original,
    normalizedQuery,
    keyboardFixed: n.keyboardFixed,
    transliterated: n.transliterated,
    variants: n.normalizedUniqueVariants,
  };
}

/** API/client payload for normalized gateway query metadata. */
export function marketplacePreparedQueryPayload(prepared: MarketplacePreparedQuery) {
  const n: GlobalSearchNormalizedQuery = normalizeGlobalSearchQuery(prepared.original);
  return {
    ...globalSearchNormalizedPayload(n),
    normalizedQuery: prepared.normalizedQuery,
    variants: prepared.variants,
  };
}
