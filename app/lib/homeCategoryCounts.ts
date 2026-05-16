"use client";

import { homeCategoryGridSections } from "./categories";
import { homeParentSlugForListing, canonicalCategorySlugForListing } from "./categoryLegacyMap";
import type { Listing } from "./listingModel";
import { dedupeListingsById, isListingPubliclyListed } from "./listingModel";

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
    for (const group of section.groups) {
      for (const child of group.links) {
        counts[child.slug] = 0;
      }
    }
  }

  for (const l of visible) {
    const leaf = canonicalCategorySlugForListing(l);
    const parentSlug = homeParentSlugForListing(l);
    if (parentSlug && Object.prototype.hasOwnProperty.call(counts, parentSlug)) {
      counts[parentSlug] = (counts[parentSlug] ?? 0) + 1;
    }
    if (leaf && leaf !== parentSlug && Object.prototype.hasOwnProperty.call(counts, leaf)) {
      counts[leaf] = (counts[leaf] ?? 0) + 1;
    }
  }

  return { counts, uniqueVisible: visible };
}
