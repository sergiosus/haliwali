/**
 * Geo helpers for local MVP.
 *
 * TODO(VPS/PostgreSQL):
 * - store `latitude`/`longitude` columns (double precision) and index `city`.
 * - for true radius search, add PostGIS and use `ST_DWithin` + GiST index.
 * - avoid large client-side geo filtering on big datasets.
 */

export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 0.05) return "0 км";
  if (km < 10) return `${km.toFixed(1)} км`;
  return `${Math.round(km)} км`;
}

export function isFiniteLatLng(lat?: number, lng?: number): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat + lng);
}
