"use client";

import { calculateDistanceKm } from "../../lib/shared/geo";
import {
  findNearestCanonicalMajorForGpsLabelPreference,
  getCanonicalMajorCityProfile,
  haversineKm,
  normalizeMajorCityLookupKey,
} from "./majorRussiaCities";
import {
  isValidDetectedSettlement,
  looksLikeDistrictAdministrativeLabel,
  looksLikeRuralAutoSettlement,
} from "./russiaPlaceLabelHeuristics";

/** Same query radius as {@link CIRCLE_RADIUS_KM} in LocationModal / browse circle. */
export const NEARBY_SNAP_QUERY_RADIUS_KM = 100;

/** If browser coordinates are within this distance (km) of an acceptable nearest НП, prefer that settlement. */
export const GEO_SNAP_TO_SETTLEMENT_MAX_KM = 3;

/**
 * Max distance (km) from a snapped settlement’s centroid to a preferred major center so the settlement
 * counts as the same metro / commuter shell (satellite suburb, not an independent distant town).
 */
const SNAP_SATELLITE_IN_AGGLO_MAX_KM = 34;

type LatLng = { readonly lat: number; readonly lng: number };

type SettlementRecord = {
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lng: number;
};

type NearbySettlementWithDistance = SettlementRecord & { readonly distanceKm: number };

function distanceKmBetween(a: LatLng, b: LatLng): number {
  return calculateDistanceKm(a.lat, a.lng, b.lat, b.lng);
}

function isAcceptableGeoSettlementPick(s: SettlementRecord): boolean {
  const name = (s.name ?? "").trim();
  if (!name) return false;
  if (!isValidDetectedSettlement(name)) return false;
  if (looksLikeDistrictAdministrativeLabel(name)) return false;
  if (looksLikeRuralAutoSettlement(name)) return false;
  return true;
}

export type SnappedSettlement = {
  name: string;
  region: string;
  lat: number;
  lng: number;
};

/** When GPS snaps to the closest DB point, optionally relabel as the nearest seeded major if that point is metro-adjacent. */
function snapWithCanonicalMajorSatellitePreference(at: LatLng, row: SettlementRecord): SnappedSettlement {
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

async function fetchNearbyApi(
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

/** Nearest acceptable НП whose distance from `at` is ≤ `maxKm`. */
export async function snapNearestSettlementWithinKm(at: LatLng, maxKm: number): Promise<SnappedSettlement | null> {
  try {
    const { nearest, items } = await fetchNearbyApi(at, NEARBY_SNAP_QUERY_RADIUS_KM, 500);
    let bestRow: NearbySettlementWithDistance | null = null;
    let bestDist = Infinity;
    for (const row of items) {
      if (!isAcceptableGeoSettlementPick(row)) continue;
      const d =
        typeof row.distanceKm === "number" && Number.isFinite(row.distanceKm) ?
          row.distanceKm
        : distanceKmBetween(at, { lat: row.lat, lng: row.lng });
      if (d <= maxKm + 1e-9 && d < bestDist) {
        bestDist = d;
        bestRow = row;
      }
    }
    if (bestRow) {
      return snapWithCanonicalMajorSatellitePreference(at, bestRow);
    }
    if (nearest && isAcceptableGeoSettlementPick(nearest)) {
      const d = distanceKmBetween(at, { lat: nearest.lat, lng: nearest.lng });
      if (d <= maxKm + 1e-9) {
        return snapWithCanonicalMajorSatellitePreference(at, nearest);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
