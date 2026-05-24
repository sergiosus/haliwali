/**
 * Marketplace gateway query preparation — original query for URLs; optional correction hints only.
 */

import {
  collapseSearchSpaces,
  globalSearchNormalizedPayload,
  normalizeGlobalSearchQuery,
  type GlobalSearchNormalizedQuery,
} from "./globalSearchNormalize";

const CYRILLIC_RE = /[\u0400-\u04FF]/;

export type MarketplacePreparedQuery = {
  original: string;
  /** User query for provider URLs, action labels, and card fetch (never auto layout-fixed). */
  normalizedQuery: string;
  keyboardFixed: string | null;
  transliterated: string | null;
  /** Deduped variants (primary, keyboard, translit) for matching / cache metadata. */
  variants: string[];
};

/** Trimmed user input — primary search text for marketplace outbound links. */
export function marketplacePrimaryQueryText(raw: string): string {
  return (raw ?? "").trim();
}

function hasLikelyEnglishVowels(text: string): boolean {
  return /[aeiou]/i.test(text);
}

/** Layout fix is a hint only when Latin input likely was typed on EN keyboard (not brand English). */
function shouldSuggestKeyboardLayoutFix(
  original: string,
  keyboardFixed: string | null,
): boolean {
  if (!keyboardFixed) return false;
  const typed = collapseSearchSpaces(original);
  if (!typed || keyboardFixed === typed) return false;
  if (CYRILLIC_RE.test(original)) return false;
  if (!CYRILLIC_RE.test(keyboardFixed)) return false;
  if (hasLikelyEnglishVowels(original)) return false;
  return true;
}

/** Optional hint (e.g. ghbdtn → привет); never applied until user clicks. */
export function marketplaceSearchCorrectionHint(raw: string): string | null {
  const trimmed = marketplacePrimaryQueryText(raw);
  if (trimmed.length < 2) return null;
  const n = normalizeGlobalSearchQuery(trimmed);

  if (n.keyboardFixed && shouldSuggestKeyboardLayoutFix(trimmed, n.keyboardFixed)) {
    return n.keyboardFixed;
  }

  if (
    n.transliterated &&
    n.transliterated !== n.primary &&
    n.transliterated !== collapseSearchSpaces(trimmed) &&
    !CYRILLIC_RE.test(trimmed) &&
    !n.keyboardFixed
  ) {
    return n.transliterated;
  }

  return null;
}

export function prepareMarketplaceGatewayQuery(raw: string): MarketplacePreparedQuery {
  const n = normalizeGlobalSearchQuery(raw);
  const normalizedQuery = marketplacePrimaryQueryText(raw) || n.original;
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
