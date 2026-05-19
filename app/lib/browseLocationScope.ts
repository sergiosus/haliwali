"use client";

import { incomingModalFieldsToScope } from "./locationModalSearchScope";
import {
  DEFAULT_SEARCH_SCOPE,
  isDeprecatedGpsUserFacingLabel,
  normalizeSearchScope,
  replaceDeprecatedGpsUserLabelWithNeutral,
  type SearchScopeLocation,
} from "./searchScopeLocation";
import { pickBestSettlementAtCoords } from "./geoSettlementDetection";
import { looksLikeDistrictAdministrativeLabel } from "./russiaPlaceLabelHeuristics";
import { GEO_SNAP_TO_SETTLEMENT_MAX_KM } from "./nearbySettlementSnap";
import { findStaticRussiaCityCoords } from "./staticRussiaCities";
import {
  clearUnconfirmedLocationCatalogKeys,
  cleanupStoredAutoCityOnLoad,
  setStoredCitySource,
  setStoredSearchScope,
} from "./useStoredCity";

/** Canonical persisted browse location (`SearchScopeLocation` JSON). */
export const BROWSE_SCOPE_STORAGE_KEY = "haliwali_browse_scope";
/** Set when the user explicitly confirms a location in the modal. */
export const BROWSE_SCOPE_USER_SET_KEY = "haliwali_browse_scope_user_set";

/** Homepage grid columns only — not global map/category until user confirms there too. */
export const HOME_BROWSE_COLUMNS_STORAGE_KEY = "haliwali_home_browse_columns_v1";
export const HOME_BROWSE_COLUMNS_USER_SET_KEY = "haliwali_home_browse_columns_user_set";

export type HomepageColumnBrowseScopes = {
  tasks: BrowseLocationScope;
  services: BrowseLocationScope;
  products: BrowseLocationScope;
};

/** @deprecated Former parallel format — migrated into {@link BROWSE_SCOPE_STORAGE_KEY} on read, then removed. */
const LEGACY_LOCATION_V2_KEY = "haliwali_location_v2";
const LEGACY_LOCATION_V2_USER_SET_KEY = "haliwali_location_v2_user_set";

type LegacyLocationV2Blob =
  | { kind: "country"; displayLabel?: string }
  | {
      kind: "place";
      displayLabel?: string;
      city?: string;
      region?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
    };

let legacyLocationV2Migrated = false;

export type BrowseLocationScope = SearchScopeLocation;

export const DEFAULT_BROWSE_LOCATION_SCOPE: BrowseLocationScope = DEFAULT_SEARCH_SCOPE;

function parseBrowseScopeJson(raw: string | null): BrowseLocationScope | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as SearchScopeLocation;
    if (!j || typeof j !== "object" || typeof j.type !== "string" || typeof j.label !== "string") return null;
    return normalizeSearchScope(j);
  } catch {
    return null;
  }
}

function parseLegacyLocationV2Json(raw: string | null): LegacyLocationV2Blob | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as LegacyLocationV2Blob;
    if (!j || typeof j !== "object" || (j.kind !== "country" && j.kind !== "place")) return null;
    return j;
  } catch {
    return null;
  }
}

function searchScopeFromLegacyLocationV2Blob(loc: LegacyLocationV2Blob): BrowseLocationScope {
  if (loc.kind === "country") {
    return { ...DEFAULT_SEARCH_SCOPE };
  }
  const city = `${loc.city ?? ""}`.trim();
  const region = `${loc.region ?? ""}`.trim();
  const cityClean = city ? replaceDeprecatedGpsUserLabelWithNeutral(city, "Точка на карте") : "";
  let lat = typeof loc.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : undefined;
  let lng = typeof loc.lng === "number" && Number.isFinite(loc.lng) ? loc.lng : undefined;
  if ((lat === undefined || lng === undefined) && city) {
    const resolved = findStaticRussiaCityCoords(city, region);
    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    }
  }
  return normalizeSearchScope(
    incomingModalFieldsToScope({
      city: cityClean,
      region,
      displayName: replaceDeprecatedGpsUserLabelWithNeutral(
        `${loc.displayLabel ?? ""}`.trim() || (region ? `${cityClean}, ${region}` : cityClean),
        "Точка на карте",
      ),
      radiusKm:
        typeof loc.radiusKm === "number" && Number.isFinite(loc.radiusKm) && loc.radiusKm > 0 ?
          Math.max(0, Math.round(loc.radiusKm))
        : 0,
      ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
    }),
  );
}

/** One-time import of `haliwali_location_v2` → browse scope + V1 keys; drops the legacy blob. */
export function migrateLegacyLocationV2Storage(): void {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(LEGACY_LOCATION_V2_KEY);
  if (!raw?.trim()) {
    try {
      localStorage.removeItem(LEGACY_LOCATION_V2_USER_SET_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  const blob = parseLegacyLocationV2Json(raw);
  const userSet = localStorage.getItem(LEGACY_LOCATION_V2_USER_SET_KEY) === "1";
  const scope = blob ? searchScopeFromLegacyLocationV2Blob(blob) : null;

  const hasBrowseUserSet =
    localStorage.getItem(BROWSE_SCOPE_USER_SET_KEY) === "1" &&
    parseBrowseScopeJson(localStorage.getItem(BROWSE_SCOPE_STORAGE_KEY)) != null;

  if (scope && userSet && !hasBrowseUserSet) {
    try {
      localStorage.setItem(BROWSE_SCOPE_STORAGE_KEY, JSON.stringify(scope));
      localStorage.setItem(BROWSE_SCOPE_USER_SET_KEY, "1");
      setStoredSearchScope(scope);
      setStoredCitySource("manual");
    } catch {
      /* ignore */
    }
  }

  try {
    localStorage.removeItem(LEGACY_LOCATION_V2_KEY);
    localStorage.removeItem(LEGACY_LOCATION_V2_USER_SET_KEY);
  } catch {
    /* ignore */
  }
}

function ensureLegacyLocationV2Migrated(): void {
  if (legacyLocationV2Migrated || typeof window === "undefined") return;
  legacyLocationV2Migrated = true;
  migrateLegacyLocationV2Storage();
}

/** Explicit user-chosen browse scope from storage (never stale auto-detect). */
export function readPersistedUserBrowseScope(): BrowseLocationScope | null {
  if (typeof window === "undefined") return null;
  ensureLegacyLocationV2Migrated();

  if (localStorage.getItem(BROWSE_SCOPE_USER_SET_KEY) === "1") {
    const fromBrowse = parseBrowseScopeJson(localStorage.getItem(BROWSE_SCOPE_STORAGE_KEY));
    if (fromBrowse) return fromBrowse;
  }

  return null;
}

/** Remove orphan browse/catalog keys when the user never confirmed a location. */
export function purgeUnconfirmedLocationStorage(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(BROWSE_SCOPE_USER_SET_KEY) === "1") return;
  try {
    localStorage.removeItem(BROWSE_SCOPE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  clearUnconfirmedLocationCatalogKeys();
}

/**
 * Global browse filter: explicit user selection only, otherwise «Вся Россия».
 * Geolocation never affects this — detected city stays inside {@link LocationModal} until confirm.
 */
export function resolveSelectedBrowseLocationScope(): BrowseLocationScope {
  if (typeof window === "undefined") return DEFAULT_BROWSE_LOCATION_SCOPE;
  ensureLegacyLocationV2Migrated();
  purgeAutoDetectedLocationFromStorage();
  const persisted = readPersistedUserBrowseScope();
  return persisted ? normalizeSearchScope(persisted) : DEFAULT_BROWSE_LOCATION_SCOPE;
}

/** Drop any previously auto-written city from global storage (not a user selection). */
/** @deprecated Use {@link purgeUnconfirmedLocationStorage}. */
export function purgeAutoDetectedLocationFromStorage(): void {
  purgeUnconfirmedLocationStorage();
}

async function sanitizeBrowseScopeForPersist(scope: BrowseLocationScope): Promise<BrowseLocationScope> {
  const norm = normalizeSearchScope(scope);
  const lat = norm.lat;
  const lng = norm.lng;
  const hasCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat + lng);

  const snapSafe = async () => {
    if (!hasCoords) return null;
    try {
      return await pickBestSettlementAtCoords({ lat: lat!, lng: lng! }, GEO_SNAP_TO_SETTLEMENT_MAX_KM);
    } catch {
      return null;
    }
  };

  const scopeFromSnap = async () => {
    const snapped = await snapSafe();
    if (!snapped) return null;
    return normalizeSearchScope({
      type: "city",
      label: snapped.name,
      region: snapped.region,
      parentName: snapped.region,
      lat: snapped.lat,
      lng: snapped.lng,
    });
  };

  if (norm.type === "point") {
    if (!hasCoords) return DEFAULT_BROWSE_LOCATION_SCOPE;
    const cityScope = await scopeFromSnap();
    return cityScope ?? DEFAULT_BROWSE_LOCATION_SCOPE;
  }

  if (hasCoords && (norm.type === "city" || norm.type === "settlement")) {
    const label = (norm.label ?? "").trim();
    if (isDeprecatedGpsUserFacingLabel(label) || looksLikeDistrictAdministrativeLabel(label)) {
      const cityScope = await scopeFromSnap();
      if (cityScope) return cityScope;
    }
  }

  return norm;
}

function parseHomepageColumnBrowseScopesJson(raw: string | null): HomepageColumnBrowseScopes | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as {
      tasks?: SearchScopeLocation;
      services?: SearchScopeLocation;
      products?: SearchScopeLocation;
    };
    if (!j || typeof j !== "object") return null;
    const tasks = j.tasks ? parseBrowseScopeJson(JSON.stringify(j.tasks)) : null;
    const services = j.services ? parseBrowseScopeJson(JSON.stringify(j.services)) : null;
    const products = j.products ? parseBrowseScopeJson(JSON.stringify(j.products)) : null;
    if (!tasks || !services || !products) return null;
    return { tasks, services, products };
  } catch {
    return null;
  }
}

/** Restore homepage column filters only after explicit confirm on the homepage LocationModal. */
export function readPersistedHomepageColumnBrowseScopes(): HomepageColumnBrowseScopes | null {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(HOME_BROWSE_COLUMNS_USER_SET_KEY) !== "1") return null;
  return parseHomepageColumnBrowseScopesJson(localStorage.getItem(HOME_BROWSE_COLUMNS_STORAGE_KEY));
}

export function persistHomepageColumnBrowseScopes(scopes: HomepageColumnBrowseScopes): void {
  if (typeof window === "undefined") return;
  const payload: HomepageColumnBrowseScopes = {
    tasks: normalizeSearchScope(scopes.tasks),
    services: normalizeSearchScope(scopes.services),
    products: normalizeSearchScope(scopes.products),
  };
  try {
    localStorage.setItem(HOME_BROWSE_COLUMNS_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(HOME_BROWSE_COLUMNS_USER_SET_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Persist browse scope and mirror into `haliwali_search_scope_v1` + flat city keys for category filters. */
export function persistBrowseLocationScope(scope: BrowseLocationScope): void {
  if (typeof window === "undefined") return;
  ensureLegacyLocationV2Migrated();

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
      setStoredCitySource("manual");
    } catch {
      /* ignore */
    }

    try {
      localStorage.removeItem(LEGACY_LOCATION_V2_KEY);
      localStorage.removeItem(LEGACY_LOCATION_V2_USER_SET_KEY);
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
        normIncoming.type === "point" ? DEFAULT_BROWSE_LOCATION_SCOPE : normIncoming;
      writeNorm(fallback);
    });
}
