"use client";

import type { LocationModalChangePayload } from "../components/modals/LocationModal";
import { incomingModalFieldsToScope, type IncomingLocationModalFields } from "./locationModalSearchScope";
import {
  DEFAULT_SEARCH_SCOPE,
  legacyFieldsFromSearchScope,
  normalizeSearchScope,
  replaceDeprecatedGpsUserLabelWithNeutral,
  type SearchScopeLocation,
} from "./searchScopeLocation";
import { findStaticRussiaCityCoords } from "./staticRussiaCities";
import { setStoredSearchScope } from "./useStoredCity";

/** Separate persisted JSON from legacy `haliwali_search_scope_v1` / `haliwali_city*` — bridged on write via `syncLegacyStoredLocationFromHomeV2`. */
export const HOME_LOCATION_V2_STORAGE_KEY = "haliwali_location_v2";
const HOME_LOCATION_V2_USER_SET_KEY = "haliwali_location_v2_user_set";

export type HomeLocationV2 =
  | { kind: "country"; displayLabel: string }
  | {
      kind: "place";
      displayLabel: string;
      city: string;
      region: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
    };

export const DEFAULT_HOME_LOCATION_V2 = Object.freeze({
  kind: "country" as const,
  displayLabel: "Вся Россия",
});

function syncLegacyStoredLocationFromHomeV2(loc: HomeLocationV2): void {
  if (typeof window === "undefined") return;
  try {
    if (loc.kind === "country") {
      setStoredSearchScope(DEFAULT_SEARCH_SCOPE);
      return;
    }
    const fields = incomingFieldsFromHomeLocationV2(loc);
    let scope = normalizeSearchScope(incomingModalFieldsToScope(fields));
    const rk =
      typeof loc.radiusKm === "number" && Number.isFinite(loc.radiusKm) && loc.radiusKm > 0 ?
        Math.round(loc.radiusKm)
      : undefined;
    if (rk !== undefined) {
      scope = normalizeSearchScope({ ...scope, radiusKm: rk });
    }
    setStoredSearchScope(scope);
  } catch {
    /* ignore */
  }
}

/** Write `haliwali_location_v2` and mirror into V1 catalog keys (`setStoredSearchScope`). */
export function setPersistedHomeLocationV2(next: HomeLocationV2) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(next);
    const prev = localStorage.getItem(HOME_LOCATION_V2_STORAGE_KEY) ?? "";
    if (raw === prev) {
      syncLegacyStoredLocationFromHomeV2(next);
      return;
    }
    localStorage.setItem(HOME_LOCATION_V2_STORAGE_KEY, raw);
    localStorage.setItem(HOME_LOCATION_V2_USER_SET_KEY, "1");
    syncLegacyStoredLocationFromHomeV2(next);
  } catch {
    /* ignore */
  }
}

export function incomingFieldsFromHomeLocationV2(loc: HomeLocationV2): IncomingLocationModalFields {
  if (loc.kind === "country") {
    return {
      city: "",
      region: "",
      displayName: replaceDeprecatedGpsUserLabelWithNeutral(
        loc.displayLabel.trim() || "Вся Россия",
        "Вся Россия",
      ),
      radiusKm: 0,
      pickKind: "whole",
    };
  }
  const city = loc.city.trim();
  const region = loc.region.trim();
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

  const scope: SearchScopeLocation = normalizeSearchScope({
    type: "city",
    label: cityClean,
    region: region || undefined,
    parentName: region || undefined,
    ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
  });

  return {
    city: cityClean,
    region,
    displayName: replaceDeprecatedGpsUserLabelWithNeutral(
      loc.displayLabel.trim() || (region ? `${cityClean}, ${region}` : cityClean),
      "Точка на карте",
    ),
    radiusKm:
      typeof loc.radiusKm === "number" && Number.isFinite(loc.radiusKm) && loc.radiusKm > 0 ?
        Math.max(0, Math.round(loc.radiusKm))
      : 0,
    ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
    scope,
  };
}

/** Persisted `HomeLocationV2` ⇄ `SearchScopeLocation` helper (dual-write from `persistBrowseLocationScope`). */
export function homeLocationV2FromSearchScope(norm: SearchScopeLocation): HomeLocationV2 {
  const n = normalizeSearchScope(norm);
  const L = legacyFieldsFromSearchScope(n);
  return homeLocationV2FromModalPayload({
    scope: n,
    city: L.city,
    region: L.region,
    displayName: L.displayName,
    radiusKm: L.radiusKm,
    lat: L.lat,
    lng: L.lng,
    pickKind: L.pickKind,
    district: L.district,
  });
}

export function homeLocationV2FromModalPayload(next: LocationModalChangePayload): HomeLocationV2 {
  if (next.scope.type === "country" || next.pickKind === "whole") {
    return { kind: "country", displayLabel: "Вся Россия" };
  }

  if (next.scope.type === "region" || next.scope.type === "federal_district") {
    const raw = `${next.region || next.displayName || next.scope.label}`.trim();
    const name =
      replaceDeprecatedGpsUserLabelWithNeutral(
        raw,
        raw || DEFAULT_HOME_LOCATION_V2.displayLabel,
      ) || DEFAULT_HOME_LOCATION_V2.displayLabel;
    return { kind: "place", city: name, region: "", displayLabel: name };
  }

  if (next.scope.type === "district") {
    const d = replaceDeprecatedGpsUserLabelWithNeutral(
      `${next.scope.label || next.city || ""}`.trim(),
      "Точка на карте",
    );
    const reg = `${next.region}`.trim();
    const displayLabel = replaceDeprecatedGpsUserLabelWithNeutral(
      `${next.displayName}`.trim() || (reg ? `${d}, ${reg}` : d || reg),
      "Точка на карте",
    );
    return {
      kind: "place",
      city: d || reg,
      region: reg,
      displayLabel,
    };
  }

  const cityRaw = `${next.city}`.trim();
  const city = cityRaw ? replaceDeprecatedGpsUserLabelWithNeutral(cityRaw, "Точка на карте") : "";
  const region = `${next.region}`.trim();
  const displayName = replaceDeprecatedGpsUserLabelWithNeutral(
    `${next.displayName}`.trim() || (region ? `${city}, ${region}` : city) || city,
    "Точка на карте",
  );
  const lat = typeof next.lat === "number" && Number.isFinite(next.lat) ? next.lat : undefined;
  const lng = typeof next.lng === "number" && Number.isFinite(next.lng) ? next.lng : undefined;
  const radiusKm =
    typeof next.radiusKm === "number" && Number.isFinite(next.radiusKm) && next.radiusKm > 0 ?
      Math.max(0, Math.round(next.radiusKm))
    : undefined;
  return {
    kind: "place",
    city,
    region,
    displayLabel: displayName,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    ...(radiusKm !== undefined ? { radiusKm } : {}),
  };
}
