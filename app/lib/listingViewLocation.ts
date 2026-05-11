"use client";

import { BROWSE_SCOPE_STORAGE_KEY } from "./browseLocationScope";
import { HOME_LOCATION_V2_STORAGE_KEY, type HomeLocationV2 } from "./homeLocationV2";
import { normalizeSearchScope, type SearchScopeLocation } from "./searchScopeLocation";

export type ListingViewLocationPayload = {
  city?: string;
  region?: string;
  country?: string;
};

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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

function fromHomeLocationV2(loc: HomeLocationV2): ListingViewLocationPayload {
  if (loc.kind === "country") return { country: "Россия" };
  const city = (loc.city ?? "").trim();
  const region = (loc.region ?? "").trim();
  return {
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    country: "Россия",
  };
}

/** Best-effort viewer city/region from persisted client location (no geo-IP). */
export function readListingViewLocationPayload(): ListingViewLocationPayload {
  if (typeof window === "undefined") return {};
  try {
    const home = readJson<HomeLocationV2>(localStorage.getItem(HOME_LOCATION_V2_STORAGE_KEY));
    if (home) return fromHomeLocationV2(home);
  } catch {
    /* ignore */
  }
  try {
    const browse = readJson<SearchScopeLocation>(localStorage.getItem(BROWSE_SCOPE_STORAGE_KEY));
    if (browse) return fromSearchScope(browse);
  } catch {
    /* ignore */
  }
  try {
    const city = (localStorage.getItem("haliwali_city") ?? "").trim();
    const region = (localStorage.getItem("haliwali_city_region") ?? "").trim();
    if (city || region) {
      return {
        ...(city ? { city } : {}),
        ...(region ? { region } : {}),
        country: "Россия",
      };
    }
  } catch {
    /* ignore */
  }
  return {};
}
