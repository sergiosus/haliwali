"use client";

import { homeCategoryGridSections } from "./directory";
import type { Listing } from "./listingModel";
import { dedupeListingsById, isListingPubliclyListed } from "./listingModel";

export function resolveHomeGridCategorySlug(l: Listing): string {
  return (l.categorySlug ?? "").trim() || "other";
}

export function computeHomeCategoryCounts(
  listings: readonly Listing[],
  opts?: { listingLocationFilter?: (l: Listing) => boolean },
): { counts: Record<string, number>; uniqueVisible: Listing[] } {
  const filter = opts?.listingLocationFilter;
  const unique = dedupeListingsById(listings);
  const visible = unique.filter((l) => isListingPubliclyListed(l) && (!filter || filter(l)));

  const counts: Record<string, number> = {};
  for (const section of homeCategoryGridSections) {
    for (const link of section.links) {
      counts[link.slug] = 0;
    }
  }

  for (const l of visible) {
    const slug = (l.categorySlug ?? "").trim();
    if (slug && Object.prototype.hasOwnProperty.call(counts, slug)) {
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
  }

  return { counts, uniqueVisible: visible };
}
