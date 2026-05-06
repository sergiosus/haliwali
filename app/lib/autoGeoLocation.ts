"use client";

/**
 * Explicit geolocation APIs were removed — keep module so legacy imports resolve.
 * Prefer opening the manual `LocationModal` instead.
 */

export type AutoGeoResolve =
  | { ok: true; city: string; region: string; coords: { lat: number; lng: number } }
  | { ok: false; notRussia: boolean };

/** @deprecated No-op stub (no navigator.geolocation, no reverse-geocode calls). */
export async function resolveCityForAutoGeolocation(_lat: number, _lng: number): Promise<AutoGeoResolve> {
  await Promise.resolve();
  return { ok: false, notRussia: false };
}
