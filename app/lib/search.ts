"use client";

import type { Listing } from "./listings";
import { collapseSearchSpaces } from "./globalSearchNormalize";
import {
  buildListingSearchHaystack,
  haystackMatchesRawQuery,
  listingMatchesSearchQuery,
  scoreListingSearch,
} from "./searchMatch";

export {
  buildListingSearchHaystack,
  getSearchQueryVariants,
  hasActiveSearchQuery,
  haystackMatchesRawQuery,
  listingMatchesSearchQuery,
  normalizeGlobalSearchQuery,
  scoreListingSearch,
  searchDebugLog,
} from "./searchMatch";

/** @deprecated Use {@link buildListingSearchHaystack}. */
export function listingSearchHaystack(listing: Listing) {
  return buildListingSearchHaystack(listing);
}

export function matchesListingQuery(listing: Listing, query: string) {
  return listingMatchesSearchQuery(listing, query);
}

/** Pre-normalized haystack (e.g. category labels) vs raw user query. */
export function haystackNormalizedMatchesListingSearch(haystackLower: string, rawQuery: string): boolean {
  return haystackMatchesRawQuery(collapseSearchSpaces(haystackLower), rawQuery);
}
