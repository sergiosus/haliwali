"use client";

import type { LocationModalValue } from "../components/modals/LocationModal";
import { searchScopeWholeRussia } from "./locationModalSearchScope";
import type { SelectedLocation } from "./selectedLocation";

/** Modal seed for listing create/edit — explicit selection only, never geolocation or draft text. */
export function listingLocationModalValue(selected: SelectedLocation | null): LocationModalValue {
  const city = (selected?.city ?? "").trim();
  if (!city) {
    return {
      scope: searchScopeWholeRussia(),
      city: "",
      region: "",
      displayName: "Вся Россия",
      pickKind: "whole",
      radiusKm: 0,
    };
  }

  const region = (selected?.region ?? "").trim();
  const lat = typeof selected?.latitude === "number" && Number.isFinite(selected.latitude) ? selected.latitude : undefined;
  const lng =
    typeof selected?.longitude === "number" && Number.isFinite(selected.longitude) ? selected.longitude : undefined;
  const displayName = (selected?.displayName ?? "").trim() || (region ? `${city}, ${region}` : city);

  return {
    city,
    region,
    displayName,
    radiusKm: 0,
    lat,
    lng,
    scope: {
      type: "city",
      label: city,
      region: region || undefined,
      parentName: region || undefined,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    },
  };
}
