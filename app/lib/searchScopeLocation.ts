import { calculateDistanceKm, isFiniteLatLng } from "@/lib/shared/geo";
import type { Listing } from "./listingModel";
import {
  isFederalDistrictLabel,
  federalDistrictSubjectsLc,
  normalizeComparableRegionKey,
  regionLabelsMatch,
} from "./russiaAdministrativeAreas";
import { canonicalRussiaRegionLabel } from "./russiaRegionCanonical";
import { normalizeRussiaLocationLookupKey } from "./locationDisplay";
import { getCanonicalMajorCityProfile } from "./majorRussiaCities";

export type SearchScopeType =
  | "country"
  | "federal_district"
  | "region"
  | "district"
  | "city"
  | "settlement"
  | "point";

export type SearchScopeLocation = {
  label: string;
  type: SearchScopeType;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  region?: string;
  parentName?: string;
};

export const DEFAULT_SEARCH_SCOPE: SearchScopeLocation = {
  label: "Вся Россия",
  type: "country",
};

export const SEARCH_SCOPE_RADIUS_OPTIONS = [1, 3, 5, 10, 25, 50, 100, 250] as const;

export function nearestAllowedRadiusKm(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  const allowed = SEARCH_SCOPE_RADIUS_OPTIONS as readonly number[];
  let best = allowed[0]!;
  let bestD = Math.abs(km - best);
  for (const x of allowed) {
    const d = Math.abs(km - x);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

export function homepageLocationLabelFromScope(scope: SearchScopeLocation): string {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;
  if (s.type === "country") return "Вся Россия";
  if (s.type === "point") return (s.label || "Точка на карте").trim() || "Точка на карте";
  return (s.label || "").trim() || "Вся Россия";
}

export function modalCurrentSelectionPartsFromScope(scope: SearchScopeLocation): string[] {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;
  if (s.type === "country") return ["Вся Россия"];
  if (s.type === "point") {
    const base = (s.label || "Точка на карте").trim() || "Точка на карте";
    const r = typeof s.radiusKm === "number" && s.radiusKm > 0 ? s.radiusKm : 0;
    return r > 0 ? [`${base} · ${r} км`] : [base];
  }
  if (s.type === "district" && (s.parentName || s.region)) {
    const pr = (s.parentName || s.region || "").trim();
    return pr ? [s.label.trim(), pr] : [s.label.trim()];
  }
  if ((s.type === "city" || s.type === "settlement") && (s.region || s.parentName)) {
    const pr = (s.region || s.parentName || "").trim();
    return pr ? [s.label.trim(), pr] : [s.label.trim()];
  }
  return [(s.label || "").trim() || "Вся Россия"];
}

export type LegacyLocationSnapshot = {
  city: string;
  region: string;
  district: string;
  displayName: string;
  pickKind: "" | "whole" | "settlement" | "region" | "district" | "point";
  lat: number | null;
  lng: number | null;
  radiusKm: number;
};

export function searchScopeFromLegacySnapshot(snap: LegacyLocationSnapshot): SearchScopeLocation {
  const city = (snap.city ?? "").trim();
  const region = (snap.region ?? "").trim();
  const district = (snap.district ?? "").trim();
  const displayName = (snap.displayName ?? "").trim();
  const pk = `${snap.pickKind ?? ""}`.trim();
  const lat = snap.lat;
  const lng = snap.lng;
  const radiusKm = snap.radiusKm;

  if (pk === "whole" || (displayName === "Вся Россия" && !city && !region && !district)) {
    return { label: "Вся Россия", type: "country" };
  }

  const pointLike =
    pk === "point" ||
    (typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat + lng) &&
      radiusKm > 0 &&
      !city);

  if (pointLike) {
    return {
      type: "point",
      label: displayName || "Точка на карте",
      lat: typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
      lng: typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
      radiusKm: nearestAllowedRadiusKm(radiusKm),
      region: region || undefined,
    };
  }

  if (pk === "district" || district) {
    return {
      type: "district",
      label: district || displayName || region,
      region: region || undefined,
      parentName: region || undefined,
    };
  }

  if (pk === "region" || (!city && region)) {
    const regLabel = region || displayName;
    if (isFederalDistrictLabel(regLabel)) {
      return { type: "federal_district", label: regLabel, region: regLabel };
    }
    return { type: "region", label: regLabel, region: regLabel };
  }

  if (city) {
    const lab = displayName || city;
    return {
      type: "city",
      label: city,
      region: region || undefined,
      parentName: region || undefined,
      lat: typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
      lng: typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
    };
  }

  return { label: displayName || "Вся Россия", type: "country" };
}

export function normalizeSearchScope(raw: SearchScopeLocation): SearchScopeLocation {
  const label = `${raw.label ?? ""}`.trim();
  switch (raw.type) {
    case "country":
      return { ...DEFAULT_SEARCH_SCOPE };
    case "point": {
      const r0 = typeof raw.radiusKm === "number" && raw.radiusKm > 0 ? raw.radiusKm : 10;
      const r = nearestAllowedRadiusKm(r0);
      return {
        type: "point",
        label: label || "Точка на карте",
        lat: raw.lat,
        lng: raw.lng,
        radiusKm: r || nearestAllowedRadiusKm(10),
        region: `${raw.region ?? ""}`.trim() || undefined,
        parentName: `${raw.parentName ?? ""}`.trim() || undefined,
      };
    }
    default: {
      const rk = typeof raw.radiusKm === "number" && Number.isFinite(raw.radiusKm) && raw.radiusKm > 0 ? raw.radiusKm : undefined;
      const base: SearchScopeLocation = {
        ...raw,
        label: label || "Вся Россия",
        region: `${raw.region ?? ""}`.trim() || undefined,
        parentName: `${raw.parentName ?? ""}`.trim() || undefined,
      };
      if (rk === undefined) {
        const { radiusKm: _, ...rest } = base;
        return rest;
      }
      return { ...base, radiusKm: Math.round(rk) };
    }
  }
}

export function legacyFieldsFromSearchScope(scope: SearchScopeLocation): {
  city: string;
  region: string;
  district: string;
  displayName: string;
  pickKind: LegacyLocationSnapshot["pickKind"];
  radiusKm: number;
  lat: number | undefined;
  lng: number | undefined;
} {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;

  if (s.type === "country") {
    return {
      city: "",
      region: "",
      district: "",
      displayName: "Вся Россия",
      pickKind: "whole",
      radiusKm: 0,
      lat: undefined,
      lng: undefined,
    };
  }

  if (s.type === "point") {
    return {
      city: "",
      region: (s.region || "").trim(),
      district: "",
      displayName: s.label || "Точка на карте",
      pickKind: "point",
      radiusKm: nearestAllowedRadiusKm(s.radiusKm ?? 0),
      lat: s.lat,
      lng: s.lng,
    };
  }

  if (s.type === "federal_district" || s.type === "region") {
    const r = (s.region || s.label || "").trim();
    return {
      city: "",
      region: r,
      district: "",
      displayName: s.label || r,
      pickKind: "region",
      radiusKm: 0,
      lat: s.lat,
      lng: s.lng,
    };
  }

  if (s.type === "district") {
    const reg = (s.region || s.parentName || "").trim();
    return {
      city: "",
      region: reg,
      district: (s.label || "").trim(),
      displayName: s.label || reg,
      pickKind: "district",
      radiusKm: 0,
      lat: s.lat,
      lng: s.lng,
    };
  }

  const resolvedCity = (s.label || "").trim();
  const resolvedRegion = (s.region || s.parentName || "").trim();
  const rk =
    typeof s.radiusKm === "number" && Number.isFinite(s.radiusKm) && s.radiusKm > 0 ? Math.round(s.radiusKm) : 0;
  return {
    city: resolvedCity,
    region: resolvedRegion,
    district: "",
    displayName: resolvedRegion ? `${resolvedCity}, ${resolvedRegion}` : resolvedCity,
    pickKind: "settlement",
    radiusKm: rk,
    lat: s.lat,
    lng: s.lng,
  };
}

function inferListingAdministrativeRegionForScope(listing: Listing): string {
  const loc = (listing as unknown as { location?: { region?: string } }).location;
  const fromLoc = typeof loc?.region === "string" ? loc.region.trim() : "";
  if (fromLoc) return fromLoc;
  const city = typeof listing.city === "string" ? listing.city.trim() : "";
  if (!city) return "";
  const canon = getCanonicalMajorCityProfile(city);
  return canon?.region.trim() ?? "";
}

/** Latitude/longitude for map markers (`listing` fields first, then `location` snapshot). */
export function listingCoordinatesForMap(listing: Listing): { lat: number; lng: number } | null {
  const lat = listing.latitude ?? listing.location?.lat;
  const lng = listing.longitude ?? listing.location?.lng;
  return isFiniteLatLng(lat, lng) ? { lat: lat!, lng: lng! } : null;
}

function listingCoords(listing: Listing): { lat: number; lng: number } | null {
  return listingCoordinatesForMap(listing);
}

function federalDistrictBroadMatch(listingRegion: string, districtLabel: string): boolean {
  const d = `${districtLabel}`.toLowerCase();
  const lr = `${listingRegion}`.toLowerCase();
  if (d.includes("приволж") && lr.includes("удмурт")) return true;
  if (d.includes("приволж") && lr.includes("татарстан")) return true;
  if (d.includes("приволж") && lr.includes("пермский")) return true;
  return false;
}

export function listingMatchesSearchScope(listing: Listing, scope: SearchScopeLocation | null | undefined): boolean {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;
  if (s.type === "country") return true;

  const listingReg = inferListingAdministrativeRegionForScope(listing);

  if (s.type === "federal_district" || s.type === "region") {
    const regRaw = (s.region || s.label || "").trim();
    if (!regRaw) return true;
    if (isFederalDistrictLabel(regRaw)) {
      const members = federalDistrictSubjectsLc(regRaw);
      const lr = canonicalRussiaRegionLabel(listingReg).toLowerCase();
      if (members.length === 0) return regionLabelsMatch(regRaw, listingReg) || federalDistrictBroadMatch(listingReg, regRaw);
      return members.some((m) => lr.includes(m) || m.includes(lr));
    }
    const lr = normalizeComparableRegionKey(canonicalRussiaRegionLabel(listingReg));
    const sr = normalizeComparableRegionKey(canonicalRussiaRegionLabel(regRaw));
    if (!lr || !sr) return true;
    return lr.includes(sr) || sr.includes(lr);
  }

  if (s.type === "district") {
    const d = (s.label || "").trim().toLowerCase();
    const addr = `${listing.city ?? ""} ${(listing as unknown as { address?: string }).address ?? ""} ${listing.location?.displayName ?? ""}`.toLowerCase();
    if (d && addr.includes(d)) return true;
    const reg = (s.parentName || s.region || "").trim();
    if (reg && listingReg && regionLabelsMatch(reg, listingReg)) return true;
    return false;
  }

  if (s.type === "city" || s.type === "settlement") {
    const rk = typeof s.radiusKm === "number" && Number.isFinite(s.radiusKm) ? s.radiusKm : 0;
    if (rk > 0 && isFiniteLatLng(s.lat, s.lng)) {
      const lc = listingCoords(listing);
      if (lc) return calculateDistanceKm(s.lat!, s.lng!, lc.lat, lc.lng) <= rk;
    }
    const target = normalizeRussiaLocationLookupKey(s.label.trim());
    const cityKey = normalizeRussiaLocationLookupKey(listing.city?.trim() ?? "");
    if (target && cityKey === target) return true;
    const dn = listing.location?.displayName?.trim();
    if (target && dn && normalizeRussiaLocationLookupKey(dn).includes(target)) return true;
    return false;
  }

  if (s.type === "point") {
    const r = typeof s.radiusKm === "number" && s.radiusKm > 0 ? s.radiusKm : 0;
    if (!isFiniteLatLng(s.lat, s.lng) || r <= 0) return true;
    const lc = listingCoords(listing);
    if (!lc) return false;
    const d = calculateDistanceKm(s.lat!, s.lng!, lc.lat, lc.lng);
    return d <= r;
  }

  return true;
}
