import {
  DEFAULT_SEARCH_SCOPE,
  normalizeSearchScope,
  type SearchScopeLocation,
  type SearchScopeType,
} from "./searchScopeLocation";

function numParam(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse location scope from `/api/search` query string. */
export function parseGlobalSearchScopeFromUrl(url: URL): SearchScopeLocation {
  const scopeJson = url.searchParams.get("scope");
  if (scopeJson?.trim()) {
    try {
      const parsed = JSON.parse(scopeJson) as SearchScopeLocation;
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
        return normalizeSearchScope(parsed);
      }
    } catch {
      /* fall through */
    }
  }

  const typeRaw = (url.searchParams.get("scopeType") ?? "").trim();
  if (!typeRaw || typeRaw === "country") return DEFAULT_SEARCH_SCOPE;

  const allowed: SearchScopeType[] = [
    "country",
    "federal_district",
    "region",
    "district",
    "city",
    "settlement",
    "point",
  ];
  const type = allowed.includes(typeRaw as SearchScopeType) ? (typeRaw as SearchScopeType) : "country";
  if (type === "country") return DEFAULT_SEARCH_SCOPE;

  return normalizeSearchScope({
    type,
    label: (url.searchParams.get("scopeLabel") ?? "").trim(),
    region: (url.searchParams.get("scopeRegion") ?? "").trim() || undefined,
    parentName: (url.searchParams.get("scopeParent") ?? "").trim() || undefined,
    lat: numParam(url.searchParams.get("scopeLat")),
    lng: numParam(url.searchParams.get("scopeLng")),
    radiusKm: numParam(url.searchParams.get("scopeRadiusKm")),
  });
}

/** Serialize scope for client fetch URLs. */
export function globalSearchScopeToQueryParams(scope: SearchScopeLocation): URLSearchParams {
  const p = new URLSearchParams();
  const norm = normalizeSearchScope(scope);
  if (norm.type === "country") {
    p.set("scopeType", "country");
    return p;
  }
  p.set("scopeType", norm.type);
  if (norm.label) p.set("scopeLabel", norm.label);
  if (norm.region) p.set("scopeRegion", norm.region);
  if (norm.parentName) p.set("scopeParent", norm.parentName);
  if (typeof norm.lat === "number" && Number.isFinite(norm.lat)) p.set("scopeLat", String(norm.lat));
  if (typeof norm.lng === "number" && Number.isFinite(norm.lng)) p.set("scopeLng", String(norm.lng));
  if (typeof norm.radiusKm === "number" && Number.isFinite(norm.radiusKm) && norm.radiusKm > 0) {
    p.set("scopeRadiusKm", String(norm.radiusKm));
  }
  return p;
}
