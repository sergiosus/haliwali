import { getCanonicalMajorCityProfile } from "./majorRussiaCities";

export type NormalizedRussiaLocationCoords = {
  city: string;
  region: string;
  displayName: string;
  coords: { lat: number; lng: number };
};

/** Strip common Russian address prefixes/suffixes for stable matching. */
export function normalizeRussiaLocationLookupKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^г\.?\s+/u, "")
    .replace(/\s+г\.?$/u, "")
    .trim();
}

type FederalDef = { city: string; region: string };

const FEDERAL_BY_KEY: Record<string, FederalDef> = {
  москва: { city: "Москва", region: "г. Москва" },
  "санкт-петербург": { city: "Санкт-Петербург", region: "г. Санкт-Петербург" },
  севастополь: { city: "Севастополь", region: "г. Севастополь" },
};

/** True when `name` denotes one of Moscow / SPb / Sevastopol (after normalizeRussiaLocationLookupKey). */
export function isFederalRussiaSettlementName(nameTrimmed: string): boolean {
  const k = normalizeRussiaLocationLookupKey(nameTrimmed);
  return k === "москва" || k === "санкт-петербург" || k === "севастополь";
}

/**
 * Normalizes city label, fills region via federal-city rules / canonical seeded majors / leftover rawRegion,
 * and builds `${city}, ${region}` unless region truly absent.
 */
export function resolveRussiaCityRegionDisplay(cityRaw: string, rawRegion?: string): {
  city: string;
  region: string;
  displayName: string;
} {
  const cityTrim = cityRaw.trim();
  const fedKey = normalizeRussiaLocationLookupKey(cityTrim);
  const fed = fedKey ? FEDERAL_BY_KEY[fedKey] : undefined;
  if (fed) {
    return {
      city: fed.city,
      region: fed.region,
      displayName: `${fed.city}, ${fed.region}`,
    };
  }

  let region = (rawRegion ?? "").trim();
  if (!region && cityTrim) {
    const canon = getCanonicalMajorCityProfile(cityTrim);
    if (canon) region = canon.region.trim();
  }
  const displayName =
    cityTrim && region ? `${cityTrim}, ${region}` : cityTrim ? cityTrim : region;
  return { city: cityTrim, region, displayName };
}

export function toNormalizedRussiaLocationCoords(
  cityRaw: string,
  rawRegion: string | undefined,
  lat: number,
  lng: number,
): NormalizedRussiaLocationCoords {
  const core = resolveRussiaCityRegionDisplay(cityRaw, rawRegion);
  return { ...core, coords: { lat, lng } };
}
