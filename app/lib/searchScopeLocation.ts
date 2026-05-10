import { calculateDistanceKm, isFiniteLatLng } from "@/lib/shared/geo";
import type { Listing } from "./listingModel";
import { findStaticRussiaCityCoords } from "./staticRussiaCities";
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

/** Old raw-GPS wording — must never be user-facing canonical place title or persisted label. */
export function isDeprecatedGpsUserFacingLabel(text: string | undefined): boolean {
  const lc = `${text ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  return lc === "моё местоположение" || lc === "мое местоположение";
}

/** If `primary` is the deprecated phrase, return `neutralFallback`; else return trimmed `primary` (or `neutralFallback` when empty). */
export function replaceDeprecatedGpsUserLabelWithNeutral(
  primary: string | undefined,
  neutralFallback: string,
): string {
  const trimmed = `${primary ?? ""}`.trim();
  if (!trimmed) return neutralFallback;
  if (isDeprecatedGpsUserFacingLabel(trimmed)) return neutralFallback;
  return trimmed;
}

export function homepageLocationLabelFromScope(scope: SearchScopeLocation): string {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;
  if (s.type === "country") return "Вся Россия";
  if (s.type === "point")
    return replaceDeprecatedGpsUserLabelWithNeutral(s.label || undefined, "Точка на карте");
  const raw = (s.label || "").trim();
  if (!raw) return "Вся Россия";
  return replaceDeprecatedGpsUserLabelWithNeutral(raw, "Точка на карте");
}

export function modalCurrentSelectionPartsFromScope(scope: SearchScopeLocation): string[] {
  const s = scope ?? DEFAULT_SEARCH_SCOPE;
  if (s.type === "country") return ["Вся Россия"];
  if (s.type === "point") {
    const base = replaceDeprecatedGpsUserLabelWithNeutral(s.label || undefined, "Точка на карте");
    const r = typeof s.radiusKm === "number" && s.radiusKm > 0 ? s.radiusKm : 0;
    return r > 0 ? [`${base} · ${r} км`] : [base];
  }
  if (s.type === "district" && (s.parentName || s.region)) {
    const pr = (s.parentName || s.region || "").trim();
    const head = replaceDeprecatedGpsUserLabelWithNeutral(s.label.trim(), "Точка на карте");
    return pr ? [head, pr] : [head];
  }
  if ((s.type === "city" || s.type === "settlement") && (s.region || s.parentName)) {
    const pr = (s.region || s.parentName || "").trim();
    const head = replaceDeprecatedGpsUserLabelWithNeutral(s.label.trim(), "Точка на карте");
    return pr ? [head, pr] : [head];
  }
  return [replaceDeprecatedGpsUserLabelWithNeutral((s.label || "").trim(), "Вся Россия")];
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
      label: replaceDeprecatedGpsUserLabelWithNeutral(displayName || undefined, "Точка на карте"),
      lat: typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
      lng: typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
      radiusKm: nearestAllowedRadiusKm(radiusKm),
      region: region || undefined,
    };
  }

  if (pk === "district" || district) {
    return {
      type: "district",
      label: replaceDeprecatedGpsUserLabelWithNeutral(
        (district || displayName || region).trim(),
        "Точка на карте",
      ),
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
    const citySafe = replaceDeprecatedGpsUserLabelWithNeutral(city, "Точка на карте");
    return {
      type: "city",
      label: citySafe,
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
        label: replaceDeprecatedGpsUserLabelWithNeutral(label || undefined, "Точка на карте"),
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
        label:
          label ?
            replaceDeprecatedGpsUserLabelWithNeutral(label, "Точка на карте")
          : "Вся Россия",
        region: `${raw.region ?? ""}`.trim() || undefined,
        parentName: `${raw.parentName ?? ""}`.trim() || undefined,
      };
      if (rk === undefined) {
        const rest = { ...base };
        delete rest.radiusKm;
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
      displayName: replaceDeprecatedGpsUserLabelWithNeutral(s.label || undefined, "Точка на карте"),
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

  const resolvedCity = replaceDeprecatedGpsUserLabelWithNeutral((s.label || "").trim(), "Точка на карте");
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

/** Parse lat/lng from API/JSON (numbers or numeric strings — pg/json sometimes yields strings). */
function parseStoredLatLngPair(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const t = v.trim().replace(",", ".");
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const lat = num(latRaw);
  const lng = num(lngRaw);
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat + lng)) return null;
  return { lat, lng };
}

/**
 * Stored listing coordinates (`latitude`/`longitude`, then `location`), with string coercion.
 * Used for scope radius checks and exact map pins.
 */
export function listingCoordinatesForMap(listing: Listing): { lat: number; lng: number } | null {
  const latRaw = listing.latitude ?? listing.location?.lat;
  const lngRaw = listing.longitude ?? listing.location?.lng;
  return parseStoredLatLngPair(latRaw, lngRaw);
}

/**
 * Placemark geometry for `/map`: exact coordinates first, then static city corpus center (`city` + inferred region).
 * Fallback keeps sidebar and map aligned for city-only postings; {@link listingMatchesSearchScope} still uses only stored coords + city/region logic.
 */
export function listingMarkerPlacemarkCoordinates(listing: Listing): { lat: number; lng: number } | null {
  const precise = listingCoordinatesForMap(listing);
  if (precise) return precise;
  const city = typeof listing.city === "string" ? listing.city.trim() : "";
  if (!city) return null;
  const region = inferListingAdministrativeRegionForScope(listing);
  const fromStatic = findStaticRussiaCityCoords(city, region);
  return fromStatic;
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
