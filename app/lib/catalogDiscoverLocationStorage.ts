import type { SelectedLocation } from "./selectedLocation";

export type CatalogDiscoverLocation = SelectedLocation & {
  settlementId: number | null;
};

const STORAGE_KEY = "haliwali_catalog_discover_location_v1";

export function readCatalogDiscoverLocation(): CatalogDiscoverLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as CatalogDiscoverLocation;
    if (!j?.city?.trim()) return null;
    return {
      city: j.city.trim(),
      region: (j.region ?? "").trim(),
      displayName: (j.displayName ?? j.city).trim(),
      address: j.address,
      latitude: typeof j.latitude === "number" ? j.latitude : undefined,
      longitude: typeof j.longitude === "number" ? j.longitude : undefined,
      source: j.source === "map" || j.source === "geolocation" ? j.source : "suggestion",
      settlementId:
        typeof j.settlementId === "number" && Number.isFinite(j.settlementId) ? j.settlementId : null,
    };
  } catch {
    return null;
  }
}

export function persistCatalogDiscoverLocation(loc: CatalogDiscoverLocation): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    /* quota */
  }
}

/** City label for search APIs (settlement name, not full display line). */
export function catalogDiscoverCityLabel(loc: CatalogDiscoverLocation | null): string {
  if (!loc?.city.trim()) return "";
  return loc.city.trim();
}
