import { isCatalogSourceName } from "./catalogSourceOfferTypes";

function titleCaseCity(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

type CitySource = {
  city: string;
  region?: string;
  citySearch?: string;
  rawPayload?: Record<string, unknown> | null;
};

function cityFromRawPayload(raw: Record<string, unknown> | null | undefined): string {
  if (!raw || typeof raw !== "object") return "";
  for (const key of ["city", "location", "geo_city"] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function cityFromCitySearch(citySearch: string): string {
  const tokens = citySearch.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (isCatalogSourceName(token)) continue;
    if (/^(avito|drom|auto|youla|vk|company_site|other|auto_ru)$/.test(token)) continue;
    return titleCaseCity(token);
  }
  return "";
}

/** Resolve human-readable city for public cards (never hide when derivable). */
export function resolveSourceOfferDisplayCity(
  offer: CitySource,
  fallbackCity?: string,
): string | null {
  const direct = offer.city?.trim();
  if (direct) return direct;

  const fromPayload = cityFromRawPayload(offer.rawPayload ?? undefined);
  if (fromPayload) return fromPayload;

  const region = offer.region?.trim();
  if (region) return region;

  if (offer.citySearch) {
    const fromSearch = cityFromCitySearch(offer.citySearch);
    if (fromSearch) return fromSearch;
  }

  const fb = fallbackCity?.trim();
  return fb ? fb : null;
}
