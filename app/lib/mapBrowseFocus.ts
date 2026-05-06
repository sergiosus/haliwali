import { canonicalRussiaRegionLabel } from "./russiaRegionCanonical";
import { getGlobalRussiaCitiesForSearch } from "./staticRussiaCities";
import { subjectsForFederalDistrict } from "./russiaFederalDistricts";

type MapCenter = { lat: number; lng: number };

const RUSSIA_WIDE: MapCenter = { lat: 61.5, lng: 99 };
const RUSSIA_ZOOM = 4;
const CITY_ZOOM = 11;

/** Fit map to approximate region bounds using merged static city coordinates. */
export function mapCenterZoomForRussiaRegion(regionLabel: string): { center: MapCenter; zoom: number } {
  const want = canonicalRussiaRegionLabel(regionLabel);
  const rows = getGlobalRussiaCitiesForSearch().filter(
    (c) => canonicalRussiaRegionLabel(c.region) === want,
  );
  if (rows.length === 0) {
    return { center: RUSSIA_WIDE, zoom: RUSSIA_ZOOM };
  }
  const lats = rows.map((r) => r.coords.lat);
  const lngs = rows.map((r) => r.coords.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center: MapCenter = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const latSpan = Math.max(0.4, maxLat - minLat);
  const lngSpan = Math.max(0.4, maxLng - minLng);
  const spanDeg = Math.max(latSpan, lngSpan);
  let zoom = 6;
  if (spanDeg > 14) zoom = 4;
  else if (spanDeg > 8) zoom = 5;
  else if (spanDeg > 4) zoom = 6;
  else if (spanDeg > 2) zoom = 7;
  else if (spanDeg > 1) zoom = 8;
  else if (spanDeg > 0.5) zoom = 9;
  else zoom = 10;
  zoom = Math.min(11, Math.max(RUSSIA_ZOOM, zoom));
  return { center, zoom };
}

export function mapCenterZoomForFederalDistrict(districtLabel: string): { center: MapCenter; zoom: number } {
  const subjects = subjectsForFederalDistrict(districtLabel);
  if (subjects.length === 0) return mapCenterZoomForRussiaWide();
  const subjSet = new Set(subjects.map((s) => canonicalRussiaRegionLabel(s)));
  const rows = getGlobalRussiaCitiesForSearch().filter((c) => subjSet.has(canonicalRussiaRegionLabel(c.region)));
  if (rows.length === 0) return mapCenterZoomForRussiaWide();
  const lats = rows.map((r) => r.coords.lat);
  const lngs = rows.map((r) => r.coords.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center: MapCenter = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const latSpan = Math.max(1.2, maxLat - minLat);
  const lngSpan = Math.max(1.2, maxLng - minLng);
  const spanDeg = Math.max(latSpan, lngSpan);
  let zoom = 5;
  if (spanDeg > 26) zoom = 3;
  else if (spanDeg > 18) zoom = 4;
  else if (spanDeg > 10) zoom = 5;
  else if (spanDeg > 6) zoom = 6;
  else zoom = 7;
  zoom = Math.min(8, Math.max(3, zoom));
  return { center, zoom };
}

export function mapCenterZoomForRussiaWide(): { center: MapCenter; zoom: number } {
  return { center: RUSSIA_WIDE, zoom: RUSSIA_ZOOM };
}

export function mapCenterZoomForCity(lat: number, lng: number): { center: MapCenter; zoom: number } {
  if (!Number.isFinite(lat + lng)) return mapCenterZoomForRussiaWide();
  return { center: { lat, lng }, zoom: CITY_ZOOM };
}
