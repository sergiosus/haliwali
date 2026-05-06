import type { BrowseGeoPickRow } from "./browseGeoPickRow";
import { isFederalDistrictLabel } from "./russiaAdministrativeAreas";
import {
  type LegacyLocationSnapshot,
  type SearchScopeLocation,
  DEFAULT_SEARCH_SCOPE,
  normalizeSearchScope,
  searchScopeFromLegacySnapshot,
} from "./searchScopeLocation";

export type IncomingLocationModalFields = {
  city?: string;
  region?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  displayName?: string;
  pickKind?: LegacyLocationSnapshot["pickKind"];
  district?: string;
  citySeed?: string;
  scope?: SearchScopeLocation;
};

export function incomingModalFieldsToScope(v: IncomingLocationModalFields | null | undefined): SearchScopeLocation {
  if (v?.scope) {
    const base = normalizeSearchScope(v.scope);
    const la = typeof v.lat === "number" && Number.isFinite(v.lat) ? v.lat : undefined;
    const lo = typeof v.lng === "number" && Number.isFinite(v.lng) ? v.lng : undefined;
    if (
      la !== undefined &&
      lo !== undefined &&
      (typeof base.lat !== "number" ||
        !Number.isFinite(base.lat) ||
        typeof base.lng !== "number" ||
        !Number.isFinite(base.lng))
    ) {
      return normalizeSearchScope({ ...base, lat: la, lng: lo });
    }
    return base;
  }
  const city = `${v?.city ?? ""}`.trim() || `${v?.citySeed ?? ""}`.trim().split(",")[0]?.trim() || "";
  const snap: LegacyLocationSnapshot = {
    city,
    region: `${v?.region ?? ""}`.trim(),
    district: `${v?.district ?? ""}`.trim(),
    displayName: `${v?.displayName ?? ""}`.trim(),
    pickKind: `${v?.pickKind ?? ""}`.trim() as LegacyLocationSnapshot["pickKind"],
    lat: typeof v?.lat === "number" && Number.isFinite(v.lat) ? v.lat : null,
    lng: typeof v?.lng === "number" && Number.isFinite(v.lng) ? v.lng : null,
    radiusKm:
      typeof v?.radiusKm === "number" && Number.isFinite(v.radiusKm) ?
        Math.max(0, Math.round(v.radiusKm))
      : 0,
  };
  const base = searchScopeFromLegacySnapshot(snap);
  return normalizeSearchScope(base);
}

export type ScopeSearchIntent = "all" | "region" | "city";

/** @deprecated intent chips removed — kept for compatibility; returns rows unchanged. */
export function filterBrowseRowsByIntent(
  rows: readonly BrowseGeoPickRow[],
  _intent: ScopeSearchIntent,
): BrowseGeoPickRow[] {
  return [...rows];
}

export function searchScopeWholeRussia(): SearchScopeLocation {
  return { ...DEFAULT_SEARCH_SCOPE };
}

export function searchScopeFromBrowseGeoRow(row: BrowseGeoPickRow): SearchScopeLocation {
  const lat = typeof row.lat === "number" && Number.isFinite(row.lat) ? row.lat : undefined;
  const lng = typeof row.lng === "number" && Number.isFinite(row.lng) ? row.lng : undefined;
  const reg = `${row.regionFilterName ?? ""}`.trim();

  if (row.pickKind === "settlement") {
    const subtype = `${row.subtypeLabel ?? ""}`;
    const isRuralSubtype =
      subtype === "село" || subtype === "деревня" || subtype === "посёлок" || subtype === "населённый пункт";
    return normalizeSearchScope({
      label: `${row.settlementName || row.displayNameClean}`.trim(),
      type: isRuralSubtype ? "settlement" : "city",
      region: reg || undefined,
      parentName: reg || undefined,
      lat,
      lng,
    });
  }

  if (row.pickKind === "region") {
    const name = reg || `${row.displayNameClean ?? ""}`.trim();
    if (isFederalDistrictLabel(name)) {
      return normalizeSearchScope({ type: "federal_district", label: name, region: name, lat, lng });
    }
    return normalizeSearchScope({ type: "region", label: name, region: name, lat, lng });
  }

  if (row.pickKind === "district") {
    const dTxt = `${row.districtFilter ?? ""}`.trim();
    return normalizeSearchScope({
      type: "district",
      label: dTxt || row.displayNameClean,
      region: reg,
      parentName: reg,
      lat,
      lng,
    });
  }

  if (row.pickKind === "whole") {
    return searchScopeWholeRussia();
  }

  if (row.pickKind === "point") {
    return normalizeSearchScope({
      type: "point",
      label: row.displayNameClean || "Точка на карте",
      lat,
      lng,
      radiusKm: 10,
      region: reg || undefined,
    });
  }

  return normalizeSearchScope({
    type: "city",
    label: row.settlementName || row.displayNameClean,
    region: reg || undefined,
    parentName: reg || undefined,
    lat,
    lng,
  });
}
