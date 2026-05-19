/**
 * Shared listing/category text match + ranking (client + server).
 * All flows must use {@link normalizeGlobalSearchQuery} / {@link getSearchQueryVariants} from globalSearchNormalize.
 */

import { allDirectoryItems } from "./categoryDirectory";
import { collapseSearchSpaces, getSearchQueryVariants, normalizeGlobalSearchQuery } from "./globalSearchNormalize";
import type { Listing } from "./listingModel";
import type { GlobalSearchSuggestItem } from "./globalSearchTypes";
import { filterGlobalRussiaCitiesByQuery } from "./staticRussiaCities";

export { getSearchQueryVariants, normalizeGlobalSearchQuery } from "./globalSearchNormalize";

/** Dev-only search diagnostics (never logs in production). */
export function searchDebugLog(label: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug(`[haliwali-search] ${label}`, data);
}

export function haystackMatchesVariants(haystackLower: string, variants: readonly string[]): boolean {
  if (variants.length === 0) return true;
  const hay = collapseSearchSpaces(haystackLower);
  if (!hay) return false;

  for (const v of variants) {
    if (!v) continue;
    if (hay.includes(v)) return true;
    const words = hay.split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (w.startsWith(v) || w.includes(v)) return true;
    }
  }
  return false;
}

export function haystackMatchesRawQuery(haystackLower: string, rawQuery: string): boolean {
  const normalized = normalizeGlobalSearchQuery(rawQuery);
  return haystackMatchesVariants(haystackLower, normalized.normalizedUniqueVariants);
}

export function buildListingSearchHaystack(listing: Listing): string {
  const spec =
    listing.type === "service" && "specialization" in listing ?
      String((listing as { specialization?: string }).specialization ?? "")
    : "";
  const region =
    typeof listing.location?.region === "string" ? listing.location.region.trim() : "";
  return collapseSearchSpaces(
    [
      listing.title,
      listing.description,
      listing.categoryName,
      listing.categorySlug,
      listing.city,
      listing.address,
      region,
      spec,
      listing.type,
    ].join(" "),
  );
}

export function listingMatchesSearchQuery(listing: Listing, rawQuery: string): boolean {
  return haystackMatchesRawQuery(buildListingSearchHaystack(listing), rawQuery);
}

/** Same ranking weights as /api/search file fallback and PG scoring tiers. */
export function scoreListingSearch(listing: Listing, rawQuery: string): number {
  const variants = getSearchQueryVariants(rawQuery);
  if (variants.length === 0) return 0;

  const title = collapseSearchSpaces(listing.title ?? "");
  const category = collapseSearchSpaces(
    `${listing.categoryName ?? ""} ${listing.categorySlug ?? ""} ${
      listing.type === "service" && "specialization" in listing ?
        (listing as { specialization?: string }).specialization ?? ""
      : ""
    }`,
  );
  const description = collapseSearchSpaces(listing.description ?? "");
  const region =
    typeof listing.location?.region === "string" ? listing.location.region.trim() : "";
  const cityHay = collapseSearchSpaces(`${listing.city ?? ""} ${region}`);

  let score = 0;
  for (const v of variants) {
    if (!v) continue;
    if (title === v) score = Math.max(score, 100);
    else if (title.startsWith(v)) score = Math.max(score, 85);
    else if (title.includes(v)) score = Math.max(score, 70);
    else if (category.includes(v)) score = Math.max(score, 50);
    else if (description.includes(v)) score = Math.max(score, 30);
    else if (cityHay.includes(v)) score = Math.max(score, 20);
  }
  return score;
}

export function hasActiveSearchQuery(rawQuery: string): boolean {
  const n = normalizeGlobalSearchQuery(rawQuery);
  return Boolean(n.primary) || n.normalizedUniqueVariants.length > 0;
}

/** Instant client suggestions (same normalization as API). */
export function buildLocalSearchSuggestions(rawQuery: string, max = 8): GlobalSearchSuggestItem[] {
  const q = normalizeGlobalSearchQuery(rawQuery).original;
  if (q.length < 2) return [];

  const out: GlobalSearchSuggestItem[] = [];
  const seen = new Set<string>();

  function push(item: GlobalSearchSuggestItem) {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  for (const item of allDirectoryItems) {
    if (out.length >= max) break;
    const hay = collapseSearchSpaces(item.title);
    if (!haystackMatchesRawQuery(hay, rawQuery)) continue;
    push({ kind: "category", label: item.title, query: item.title });
  }

  for (const c of filterGlobalRussiaCitiesByQuery(rawQuery).slice(0, 3)) {
    if (out.length >= max) break;
    const label = c.region ? `${c.city}, ${c.region}` : c.city;
    push({ kind: "city", label, query: c.city });
  }

  searchDebugLog("suggest-local", {
    raw: q,
    variants: getSearchQueryVariants(rawQuery),
    count: out.length,
  });

  return out.slice(0, max);
}
