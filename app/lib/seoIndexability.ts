type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function param(sp: SearchParamsLike, key: string): string {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? "";
  const v = sp[key];
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

/** `/search` with query, type tab, or non-country scope should not be indexed. */
export function searchPageHasFilters(sp: SearchParamsLike): boolean {
  const q = param(sp, "q");
  if (q.length >= 1) return true;

  const type = param(sp, "type").toLowerCase();
  if (type && type !== "all") return true;

  const scopeType = param(sp, "scopeType");
  if (scopeType && scopeType !== "country") return true;

  if (param(sp, "scopeLabel") || param(sp, "scopeRegion") || param(sp, "scopeParent")) return true;
  if (param(sp, "scopeLat") || param(sp, "scopeLng") || param(sp, "scopeRadiusKm")) return true;

  const scopeJson = param(sp, "scope");
  if (scopeJson) {
    try {
      const parsed = JSON.parse(scopeJson) as { type?: string };
      if (parsed?.type && parsed.type !== "country") return true;
    } catch {
      return true;
    }
  }

  return false;
}

/** Filtered `/catalogs/predlozheniya` list views should not be indexed. */
export function sourceOffersListHasFilters(sp: SearchParamsLike): boolean {
  const q = param(sp, "q");
  if (q.length >= 1) return true;

  if (param(sp, "city")) return true;
  const offerType = param(sp, "offerType");
  if (offerType && offerType !== "all") return true;
  if (param(sp, "brand")) return true;
  if (param(sp, "oem") || param(sp, "oemArticle") || param(sp, "article")) return true;
  if (param(sp, "source") || param(sp, "sourceName")) return true;
  if (param(sp, "priceFrom") || param(sp, "priceMin") || param(sp, "priceTo") || param(sp, "priceMax")) {
    return true;
  }

  const page = Number(param(sp, "page") || "1");
  if (Number.isFinite(page) && page > 1) return true;

  const pageSize = param(sp, "pageSize");
  if (pageSize && pageSize !== "20") return true;

  return false;
}
