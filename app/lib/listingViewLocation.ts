"use client";

import { migrateLegacyLocationV2Storage, readPersistedUserBrowseScope } from "./browseLocationScope";
import { normalizeSearchScope, type SearchScopeLocation } from "./searchScopeLocation";

export type ListingViewLocationPayload = {
  city?: string;
  region?: string;
  country?: string;
};

function fromSearchScope(scope: SearchScopeLocation): ListingViewLocationPayload {
  const norm = normalizeSearchScope(scope);
  if (norm.type === "country") {
    return { country: "Россия" };
  }
  const city = (norm.label ?? "").trim();
  const region = (norm.region ?? norm.parentName ?? "").trim();
  return {
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    country: "Россия",
  };
}

/** Best-effort viewer city/region from explicitly confirmed browse scope only (no geo-IP). */
export function readListingViewLocationPayload(): ListingViewLocationPayload {
  if (typeof window === "undefined") return {};
  migrateLegacyLocationV2Storage();
  const scope = readPersistedUserBrowseScope();
  if (scope) return fromSearchScope(scope);
  return { country: "Россия" };
}
