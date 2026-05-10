"use client";

import {
  DEFAULT_SEARCH_SCOPE,
  isDeprecatedGpsUserFacingLabel,
  normalizeSearchScope,
  type SearchScopeLocation,
} from "./searchScopeLocation";
import { homeLocationV2FromSearchScope, setPersistedHomeLocationV2 } from "./homeLocationV2";
import {
  GEO_SNAP_TO_SETTLEMENT_MAX_KM,
  snapNearestSettlementWithinKm,
} from "./nearbySettlementSnap";
import { setStoredSearchScope } from "./useStoredCity";

/** Canonical persisted browse-location JSON (`haliwali_browse_scope`). Homepage does not read this; callers may use `persistBrowseLocationScope` for dual-write. */
export const BROWSE_SCOPE_STORAGE_KEY = "haliwali_browse_scope";
/**
 * Companion flag for `haliwali_browse_scope`: set when `persistBrowseLocationScope` runs.
 * Category filters use V1 keys only; this pair is for future / legacy browse defaults.
 */
export const BROWSE_SCOPE_USER_SET_KEY = "haliwali_browse_scope_user_set";

export type BrowseLocationScope = SearchScopeLocation;

export const DEFAULT_BROWSE_LOCATION_SCOPE: BrowseLocationScope = DEFAULT_SEARCH_SCOPE;

async function sanitizeBrowseScopeForPersist(scope: BrowseLocationScope): Promise<BrowseLocationScope> {
  const norm = normalizeSearchScope(scope);
  const lat = norm.lat;
  const lng = norm.lng;
  const hasCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat + lng);

  const snapSafe = async () => {
    try {
      return await snapNearestSettlementWithinKm({ lat: lat!, lng: lng! }, GEO_SNAP_TO_SETTLEMENT_MAX_KM);
    } catch {
      return null;
    }
  };

  if (norm.type === "point") {
    if (!hasCoords) return normalizeSearchScope({ ...norm, label: "Точка на карте" });
    const snapped = await snapSafe();
    if (snapped) {
      return normalizeSearchScope({
        type: "city",
        label: snapped.name,
        region: snapped.region,
        parentName: snapped.region,
        lat: snapped.lat,
        lng: snapped.lng,
      });
    }
    return normalizeSearchScope({ ...norm, label: "Точка на карте" });
  }

  if (
    hasCoords &&
    (norm.type === "city" || norm.type === "settlement") &&
    isDeprecatedGpsUserFacingLabel((norm.label ?? "").trim())
  ) {
    const snapped = await snapSafe();
    if (snapped) {
      return normalizeSearchScope({
        type: "city",
        label: snapped.name,
        region: snapped.region,
        parentName: snapped.region,
        lat: snapped.lat,
        lng: snapped.lng,
      });
    }
    return normalizeSearchScope({
      type: "point",
      label: "Точка на карте",
      lat,
      lng,
      ...(typeof norm.radiusKm === "number" && norm.radiusKm > 0 ? { radiusKm: norm.radiusKm } : {}),
    });
  }

  return norm;
}

/**
 * Dual-write browse JSON + V1 search scope + `haliwali_location_v2`. Not used by the homepage (session-only scope there).
 */
export function persistBrowseLocationScope(scope: BrowseLocationScope): void {
  if (typeof window === "undefined") return;

  const normIncoming = normalizeSearchScope(scope);

  const writeNorm = (norm: BrowseLocationScope): void => {
    try {
      localStorage.setItem(BROWSE_SCOPE_STORAGE_KEY, JSON.stringify(norm));
      localStorage.setItem(BROWSE_SCOPE_USER_SET_KEY, "1");
    } catch {
      /* ignore quota / privacy mode */
    }

    try {
      setStoredSearchScope(norm);
    } catch {
      /* ignore */
    }

    try {
      setPersistedHomeLocationV2(homeLocationV2FromSearchScope(norm));
    } catch {
      /* ignore */
    }
  };

  void sanitizeBrowseScopeForPersist(normIncoming)
    .then((norm) => {
      writeNorm(norm);
    })
    .catch(() => {
      const fallback =
        normIncoming.type === "point" ?
          normalizeSearchScope({ ...normIncoming, label: "Точка на карте" })
        : normIncoming;
      writeNorm(fallback);
    });
}
