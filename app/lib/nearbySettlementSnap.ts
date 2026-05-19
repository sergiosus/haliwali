"use client";

import { pickBestSettlementAtCoords, type SnappedSettlement } from "./geoSettlementDetection";

export type { SnappedSettlement } from "./geoSettlementDetection";

/** Same query radius as {@link CIRCLE_RADIUS_KM} in LocationModal / browse circle. */
export const NEARBY_SNAP_QUERY_RADIUS_KM = 100;

/** If browser coordinates are within this distance (km) of an acceptable nearest НП, prefer that settlement. */
export const GEO_SNAP_TO_SETTLEMENT_MAX_KM = 50;

type LatLng = { readonly lat: number; readonly lng: number };

/** Nearest acceptable НП whose distance from `at` is ≤ `maxKm`. */
export async function snapNearestSettlementWithinKm(at: LatLng, maxKm: number): Promise<SnappedSettlement | null> {
  return pickBestSettlementAtCoords(at, maxKm);
}
