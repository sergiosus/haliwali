"use client";

import { calculateDistanceKm } from "@/lib/shared/geo";
import {
  isValidDetectedSettlement,
  looksLikeDistrictAdministrativeLabel,
  looksLikeRuralAutoSettlement,
} from "./russiaPlaceLabelHeuristics";
import {
  findNearestCanonicalMajorForGpsLabelPreference,
  getCanonicalMajorCityProfile,
  haversineKm,
  normalizeMajorCityLookupKey,
} from "./majorRussiaCities";
import {
  normalizeSearchScope,
  type SearchScopeLocation,
} from "./searchScopeLocation";

export type SnappedSettlement = {
  name: string;
  region: string;
  lat: number;
  lng: number;
};

type LatLng = { readonly lat: number; readonly lng: number };

type SettlementRecord = {
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lng: number;
};

const SNAP_SATELLITE_IN_AGGLO_MAX_KM = 34;

/** When GPS snaps to the closest DB point, optionally relabel as the nearest seeded major if metro-adjacent. */
export function snapWithCanonicalMajorSatellitePreference(at: LatLng, row: SettlementRecord): SnappedSettlement {
  const base: SnappedSettlement = {
    name: row.name.trim(),
    region: (row.region ?? "").trim(),
    lat: row.lat,
    lng: row.lng,
  };
  const major = findNearestCanonicalMajorForGpsLabelPreference(at.lat, at.lng);
  if (!major) return base;

  const baseKey = normalizeMajorCityLookupKey(base.name);
  const majorKey = normalizeMajorCityLookupKey(major.name);
  if (baseKey === majorKey) return base;

  const snapCanon = getCanonicalMajorCityProfile(base.name);
  if (snapCanon && normalizeMajorCityLookupKey(snapCanon.name) !== majorKey) {
    return base;
  }

  const dSatelliteToMajor = haversineKm(
    { lat: base.lat, lng: base.lng },
    { lat: major.lat, lng: major.lng },
  );
  if (dSatelliteToMajor > SNAP_SATELLITE_IN_AGGLO_MAX_KM) return base;

  return {
    name: major.name,
    region: major.region,
    lat: major.lat,
    lng: major.lng,
  };
}

/** Same query radius as LocationModal circle / nearby-settlements API. */
export const GEO_NEARBY_QUERY_RADIUS_KM = 100;

/** Max distance from GPS fix to accept a snapped settlement (suburbs / coarse GPS). */
export const GEO_CITY_DETECTION_MAX_KM = 50;

type NearbySettlementWithDistance = SettlementRecord & { readonly distanceKm: number };

export function isInsideRussiaGeolocationBounds(lat: number, lng: number): boolean {
  return lat >= 41 && lat <= 82 && lng >= 19 && lng <= 190;
}

function isAcceptableGeoSettlementPick(s: SettlementRecord): boolean {
  const name = (s.name ?? "").trim();
  if (!name) return false;
  if (!isValidDetectedSettlement(name)) return false;
  if (looksLikeDistrictAdministrativeLabel(name)) return false;
  if (looksLikeRuralAutoSettlement(name)) return false;
  return true;
}

async function fetchNearbySettlementsApi(
  center: LatLng,
  radiusKm: number,
  limit: number,
): Promise<{ items: NearbySettlementWithDistance[]; nearest: SettlementRecord | null }> {
  const url =
    `/api/geo/nearby-settlements?lat=${encodeURIComponent(String(center.lat))}` +
    `&lng=${encodeURIComponent(String(center.lng))}` +
    `&radiusKm=${encodeURIComponent(String(radiusKm))}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as
    | { items?: unknown; nearest?: unknown }
    | null;
  const itemsRaw = Array.isArray(j?.items) ? (j!.items as unknown[]) : [];
  const items: NearbySettlementWithDistance[] = itemsRaw
    .map((x) => x as Partial<NearbySettlementWithDistance>)
    .map((x) => ({
      name: String(x.name ?? "").trim(),
      region: String(x.region ?? "").trim(),
      lat: Number(x.lat),
      lng: Number(x.lng),
      distanceKm: Number((x as { distanceKm?: unknown }).distanceKm),
    }))
    .filter((x) => x.name && x.region && Number.isFinite(x.lat + x.lng) && Number.isFinite(x.distanceKm));
  const nearestRaw = j?.nearest && typeof j.nearest === "object" ? (j.nearest as Record<string, unknown>) : null;
  const nearest: SettlementRecord | null =
    nearestRaw
      ? {
          name: String(nearestRaw.name ?? "").trim(),
          region: String(nearestRaw.region ?? "").trim(),
          lat: Number(nearestRaw.lat),
          lng: Number(nearestRaw.lng),
        }
      : null;
  return {
    items,
    nearest:
      nearest && nearest.name && nearest.region && Number.isFinite(nearest.lat + nearest.lng) ? nearest : null,
  };
}

function rowToSnapped(at: LatLng, row: SettlementRecord): SnappedSettlement {
  return snapWithCanonicalMajorSatellitePreference(at, row);
}

/**
 * Nearest acceptable city/settlement from DB for coordinates (never street/district labels).
 * `maxKm` caps distance from the GPS fix; omit to accept the closest row in the query radius.
 */
export async function pickBestSettlementAtCoords(
  at: LatLng,
  maxKm: number | null = GEO_CITY_DETECTION_MAX_KM,
): Promise<SnappedSettlement | null> {
  try {
    const { nearest, items } = await fetchNearbySettlementsApi(at, GEO_NEARBY_QUERY_RADIUS_KM, 500);
    let bestRow: NearbySettlementWithDistance | null = null;
    let bestDist = Infinity;
    for (const row of items) {
      if (!isAcceptableGeoSettlementPick(row)) continue;
      const d = Number.isFinite(row.distanceKm) ? row.distanceKm : Infinity;
      if (maxKm != null && d > maxKm + 1e-9) continue;
      if (d < bestDist) {
        bestDist = d;
        bestRow = row;
      }
    }
    if (bestRow) return rowToSnapped(at, bestRow);
    if (nearest && isAcceptableGeoSettlementPick(nearest)) {
      const dist = calculateDistanceKm(at.lat, at.lng, nearest.lat, nearest.lng);
      if (maxKm == null || dist <= maxKm + 1e-9) {
        return rowToSnapped(at, nearest);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function searchScopeFromSnappedSettlement(s: SnappedSettlement): SearchScopeLocation {
  const region = (s.region ?? "").trim();
  return normalizeSearchScope({
    type: "city",
    label: s.name.trim(),
    region: region || undefined,
    parentName: region || undefined,
    lat: s.lat,
    lng: s.lng,
  });
}

export type BrowserGeolocationOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

const DEFAULT_GEO_OPTIONS: BrowserGeolocationOptions = {
  enableHighAccuracy: false,
  timeout: 12_000,
  maximumAge: 120_000,
};

/** Browser geolocation → nearest city/settlement scope, or null (caller keeps «Вся Россия»). */
export async function detectNearestCityScopeFromBrowser(
  options: BrowserGeolocationOptions = DEFAULT_GEO_OPTIONS,
): Promise<SearchScopeLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        timeout: options.timeout ?? 12_000,
        maximumAge: options.maximumAge ?? 120_000,
      },
    );
  });

  if (!pos) return null;
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (!Number.isFinite(lat + lng) || !isInsideRussiaGeolocationBounds(lat, lng)) return null;

  const snapped = await pickBestSettlementAtCoords({ lat, lng }, GEO_CITY_DETECTION_MAX_KM);
  if (!snapped) return null;
  return searchScopeFromSnappedSettlement(snapped);
}
