"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { LocationModalChangePayload } from "../components/modals/LocationModal";
import type { Listing } from "./listingModel";
import { normalizeRussiaLocationLookupKey } from "./locationDisplay";
import type { IncomingLocationModalFields } from "./locationModalSearchScope";
import { normalizeSearchScope, type SearchScopeLocation } from "./searchScopeLocation";
import { findStaticRussiaCityCoords } from "./staticRussiaCities";

/** Separate from `haliwali_search_scope_v1` / `useStoredCity` — homepage filter + label only. */
export const HOME_LOCATION_V2_STORAGE_KEY = "haliwali_location_v2";
/**
 * Guards against restoring an auto-detected / legacy city on first load.
 * We only restore persisted non-country location if user explicitly picked it.
 */
const HOME_LOCATION_V2_USER_SET_KEY = "haliwali_location_v2_user_set";

export type HomeLocationV2 =
  | { kind: "country"; displayLabel: string }
  | {
      kind: "place";
      displayLabel: string;
      city: string;
      region: string;
      /** From V2 map (optional — text-only fallback when no coords). */
      lat?: number;
      lng?: number;
      radiusKm?: number;
    };

/** Stable default for SSR + snapshot equality (same reference forever). */
export const DEFAULT_HOME_LOCATION_V2 = Object.freeze({
  kind: "country" as const,
  displayLabel: "Вся Россия",
});

let cachedHomeLocationRaw: string | null = null;
let cachedHomeLocationSnapshot: HomeLocationV2 = DEFAULT_HOME_LOCATION_V2;

function parseStoredHomeLocationV2(raw: string | null): HomeLocationV2 {
  if (!raw?.trim()) return DEFAULT_HOME_LOCATION_V2;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o?.kind === "country") {
      const dl = `${o.displayLabel ?? ""}`.trim() || "Вся Россия";
      return { kind: "country", displayLabel: dl };
    }
    if (o?.kind === "place" && typeof o.city === "string") {
      const city = `${o.city}`.trim();
      if (!city) return DEFAULT_HOME_LOCATION_V2;
      const region = typeof o.region === "string" ? `${o.region}`.trim() : "";
      const displayLabel = `${o.displayLabel ?? ""}`.trim() || (region ? `${city}, ${region}` : city);
      const lat = typeof o.lat === "number" && Number.isFinite(o.lat) ? o.lat : undefined;
      const lng = typeof o.lng === "number" && Number.isFinite(o.lng) ? o.lng : undefined;
      const radiusKm =
        typeof o.radiusKm === "number" && Number.isFinite(o.radiusKm) && o.radiusKm > 0 ? o.radiusKm : undefined;
      return { kind: "place", displayLabel, city, region, lat, lng, radiusKm };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_HOME_LOCATION_V2;
}

const v2Listeners = new Set<() => void>();

function emitHomeLocationV2() {
  for (const l of v2Listeners) l();
}

function subscribeHomeLocationV2(cb: () => void) {
  v2Listeners.add(cb);
  if (typeof window === "undefined") {
    return () => void v2Listeners.delete(cb);
  }
  function onStorage(e: StorageEvent) {
    if (e.key === HOME_LOCATION_V2_STORAGE_KEY) cb();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    v2Listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function readHomeLocationV2Client(): HomeLocationV2 {
  if (typeof window === "undefined") return DEFAULT_HOME_LOCATION_V2;
  return getHomeLocationV2Snapshot();
}

function getHomeLocationV2Snapshot(): HomeLocationV2 {
  if (typeof window === "undefined") return DEFAULT_HOME_LOCATION_V2;
  try {
    const raw = localStorage.getItem(HOME_LOCATION_V2_STORAGE_KEY) ?? "";
    const userSet = (localStorage.getItem(HOME_LOCATION_V2_USER_SET_KEY) ?? "").trim() === "1";

    // Homepage requirement: first load must default to “Вся Россия”.
    // If we have an old stored city (from legacy auto-detect or previous builds),
    // ignore it unless the user explicitly chose a location in this build.
    if (!userSet && raw.trim()) {
      const parsed = parseStoredHomeLocationV2(raw || null);
      if (parsed.kind !== "country") {
        try {
          localStorage.setItem(HOME_LOCATION_V2_STORAGE_KEY, JSON.stringify(DEFAULT_HOME_LOCATION_V2));
        } catch {
          /* ignore */
        }
        cachedHomeLocationRaw = JSON.stringify(DEFAULT_HOME_LOCATION_V2);
        cachedHomeLocationSnapshot = DEFAULT_HOME_LOCATION_V2;
        return DEFAULT_HOME_LOCATION_V2;
      }
    }
    if (raw === cachedHomeLocationRaw) {
      return cachedHomeLocationSnapshot;
    }
    cachedHomeLocationRaw = raw;
    cachedHomeLocationSnapshot = parseStoredHomeLocationV2(raw || null);
    return cachedHomeLocationSnapshot;
  } catch {
    cachedHomeLocationRaw = "";
    cachedHomeLocationSnapshot = DEFAULT_HOME_LOCATION_V2;
    return cachedHomeLocationSnapshot;
  }
}

function getServerSnapshotHomeLocationV2(): HomeLocationV2 {
  return DEFAULT_HOME_LOCATION_V2;
}

export function setPersistedHomeLocationV2(next: HomeLocationV2) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(next);
    const prev = localStorage.getItem(HOME_LOCATION_V2_STORAGE_KEY) ?? "";
    if (raw === prev) return;
    localStorage.setItem(HOME_LOCATION_V2_STORAGE_KEY, raw);
    // Mark as user-driven so future loads can restore non-country location.
    localStorage.setItem(HOME_LOCATION_V2_USER_SET_KEY, "1");
    cachedHomeLocationRaw = raw;
    cachedHomeLocationSnapshot = parseStoredHomeLocationV2(raw);
    emitHomeLocationV2();
  } catch {
    /* ignore */
  }
}

/** Stable string for React memo/effect deps (avoid subscribing to a new object ref each render). */
export function homeLocationV2StableKey(loc: HomeLocationV2): string {
  if (loc.kind === "country") return `c:${loc.displayLabel}`;
  return `p:${loc.city}|${loc.region}|${loc.displayLabel}|${loc.lat ?? ""}|${loc.lng ?? ""}|${loc.radiusKm ?? ""}`;
}

export function useHomeLocationV2() {
  const location = useSyncExternalStore(
    subscribeHomeLocationV2,
    getHomeLocationV2Snapshot,
    getServerSnapshotHomeLocationV2,
  );
  const setLocation = useCallback((next: HomeLocationV2) => setPersistedHomeLocationV2(next), []);
  return { location, setLocation };
}

export function homeLocationV2FieldLabel(loc: HomeLocationV2): string {
  if (loc.kind === "country") return loc.displayLabel.trim() || DEFAULT_HOME_LOCATION_V2.displayLabel;
  return loc.displayLabel.trim() || loc.city.trim() || DEFAULT_HOME_LOCATION_V2.displayLabel;
}

/** City/country matching only — no coords, radius, map (V2 scope). */
export function listingMatchesHomeLocationV2(listing: Listing, loc: HomeLocationV2): boolean {
  if (loc.kind === "country") return true;
  const target = normalizeRussiaLocationLookupKey(loc.city.trim());
  const cityKey = normalizeRussiaLocationLookupKey(listing.city?.trim() ?? "");
  if (target && cityKey === target) return true;
  const dn = listing.location?.displayName?.trim();
  if (target && dn && normalizeRussiaLocationLookupKey(dn).includes(target)) return true;
  return false;
}

export function incomingFieldsFromHomeLocationV2(loc: HomeLocationV2): IncomingLocationModalFields {
  if (loc.kind === "country") {
    return {
      city: "",
      region: "",
      displayName: loc.displayLabel.trim() || "Вся Россия",
      radiusKm: 0,
      pickKind: "whole",
    };
  }
  const city = loc.city.trim();
  const region = loc.region.trim();

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
    label: city,
    region: region || undefined,
    parentName: region || undefined,
    ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
  });

  return {
    city,
    region,
    displayName: loc.displayLabel.trim() || (region ? `${city}, ${region}` : city),
    radiusKm:
      typeof loc.radiusKm === "number" && Number.isFinite(loc.radiusKm) && loc.radiusKm > 0 ?
        Math.max(0, Math.round(loc.radiusKm))
      : 0,
    ...(typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {}),
    scope,
  };
}

export function homeLocationV2FromModalPayload(next: LocationModalChangePayload): HomeLocationV2 {
  if (next.scope.type === "country" || next.pickKind === "whole") {
    return { kind: "country", displayLabel: "Вся Россия" };
  }

  if (next.scope.type === "region" || next.scope.type === "federal_district") {
    const name =
      `${next.region || next.displayName || next.scope.label}`.trim() || DEFAULT_HOME_LOCATION_V2.displayLabel;
    return { kind: "place", city: name, region: "", displayLabel: name };
  }

  if (next.scope.type === "district") {
    const d = `${next.scope.label || next.city || ""}`.trim();
    const reg = `${next.region}`.trim();
    const displayLabel = `${next.displayName}`.trim() || (reg ? `${d}, ${reg}` : d || reg);
    return {
      kind: "place",
      city: d || reg,
      region: reg,
      displayLabel,
    };
  }

  const city = `${next.city}`.trim();
  const region = `${next.region}`.trim();
  const displayName =
    `${next.displayName}`.trim() || (region ? `${city}, ${region}` : city) || city;
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
