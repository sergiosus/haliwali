import { cities as APP_RF_CITIES } from "./cities";
import { calculateDistanceKm } from "@/lib/shared/geo";
import { buildSearchVariants } from "./utils/keyboardLayout";

export type StaticRussiaCity = {
  city: string;
  region: string;
  displayName: string;
  coords: { lat: number; lng: number };
};

let globalRussiaCitiesForSearchMemo: StaticRussiaCity[] | null = null;
/** Increment when merge inputs change so memo rebuilds (hot reload / deploy). */
const GLOBAL_SEARCH_DATA_REVISION = 2;
let globalRussiaCitiesMemoStamp = 0;

/** Merged STATIC_RF_CITIES plus `app/lib/cities.ts` seeds for modal search (Russia-wide; not radius-filtered). */
export function getGlobalRussiaCitiesForSearch(): StaticRussiaCity[] {
  if (
    globalRussiaCitiesForSearchMemo &&
    globalRussiaCitiesMemoStamp === GLOBAL_SEARCH_DATA_REVISION
  ) {
    return globalRussiaCitiesForSearchMemo;
  }
  const byKey = new Map<string, StaticRussiaCity>();
  const add = (c: StaticRussiaCity) => {
    const cityK = (c.city ?? "").trim().toLowerCase();
    const regK = (c.region ?? "").trim().toLowerCase();
    if (!cityK) return;
    const mergedKey = `${cityK}|${regK}`;
    if (!byKey.has(mergedKey)) {
      const city = (c.city ?? "").trim();
      const region = (c.region ?? "").trim();
      byKey.set(mergedKey, {
        city,
        region,
        displayName: (c.displayName ?? "").trim() || `${city}${region ? `, ${region}` : ""}`,
        coords: { lat: c.coords.lat, lng: c.coords.lng },
      });
    }
  };
  for (const c of STATIC_RF_CITIES) add(c);
  for (const c of APP_RF_CITIES) {
    add({
      city: c.name,
      region: c.region,
      displayName: `${c.name}, ${c.region}`,
      coords: { lat: c.lat, lng: c.lng },
    });
  }
  for (const n of STATIC_NEARBY_IZHEVSK) {
    add({
      city: n.city,
      region: n.region,
      displayName: n.displayName,
      coords: { lat: n.lat, lng: n.lng },
    });
  }
  globalRussiaCitiesMemoStamp = GLOBAL_SEARCH_DATA_REVISION;
  globalRussiaCitiesForSearchMemo = [...byKey.values()];
  return globalRussiaCitiesForSearchMemo;
}

/** Resolve canonical coords for a city + optional region (duplicate city names → match region first). */
export function findStaticRussiaCityCoords(city: string, region: string): { lat: number; lng: number } | null {
  const cl = (city ?? "").trim().toLowerCase();
  const rl = (region ?? "").trim().toLowerCase();
  if (!cl) return null;
  let fallback: StaticRussiaCity | null = null;
  for (const c of getGlobalRussiaCitiesForSearch()) {
    if ((c.city ?? "").trim().toLowerCase() !== cl) continue;
    if (rl && (c.region ?? "").trim().toLowerCase() === rl) {
      return { lat: c.coords.lat, lng: c.coords.lng };
    }
    if (!fallback) fallback = c;
  }
  return fallback ? { lat: fallback.coords.lat, lng: fallback.coords.lng } : null;
}

function rankCitySuggestion(c: StaticRussiaCity, variants: readonly string[]): number {
  const cl = (c.city ?? "").trim().toLowerCase();
  const rl = (c.region ?? "").trim().toLowerCase();
  let best = 6;
  for (const ql of variants) {
    if (!ql) continue;
    if (cl.startsWith(ql)) best = Math.min(best, 0);
    else if (cl.includes(ql)) best = Math.min(best, 2);
    else if (rl.startsWith(ql)) best = Math.min(best, 4);
    else if (rl.includes(ql)) best = Math.min(best, 5);
  }
  return best;
}

export function uniqueRegionsFromGlobalRussiaCityList(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of getGlobalRussiaCitiesForSearch()) {
    const r = (c.region ?? "").trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  out.sort((a, b) => a.localeCompare(b, "ru"));
  return out;
}

/** Manual hubs for Russia-wide search (static list). */
export const STATIC_RF_CITIES: StaticRussiaCity[] = [
  {
    city: "Москва",
    region: "г. Москва",
    displayName: "Москва, г. Москва",
    coords: { lat: 55.7558, lng: 37.6173 },
  },
  {
    city: "Санкт-Петербург",
    region: "г. Санкт-Петербург",
    displayName: "Санкт-Петербург, г. Санкт-Петербург",
    coords: { lat: 59.9343, lng: 30.3351 },
  },
  {
    city: "Ижевск",
    region: "Удмуртская Республика",
    displayName: "Ижевск, Удмуртская Республика",
    coords: { lat: 56.8527, lng: 53.2115 },
  },
  {
    city: "Казань",
    region: "Республика Татарстан",
    displayName: "Казань, Республика Татарстан",
    coords: { lat: 55.7961, lng: 49.1064 },
  },
  {
    city: "Пермь",
    region: "Пермский край",
    displayName: "Пермь, Пермский край",
    coords: { lat: 58.0105, lng: 56.2502 },
  },
  {
    city: "Уфа",
    region: "Республика Башкортостан",
    displayName: "Уфа, Республика Башкортостан",
    coords: { lat: 54.7388, lng: 55.9721 },
  },
  {
    city: "Екатеринбург",
    region: "Свердловская область",
    displayName: "Екатеринбург, Свердловская область",
    coords: { lat: 56.8389, lng: 60.6057 },
  },
  {
    city: "Самара",
    region: "Самарская область",
    displayName: "Самара, Самарская область",
    coords: { lat: 53.2001, lng: 50.1500 },
  },
  {
    city: "Нижний Новгород",
    region: "Нижегородская область",
    displayName: "Нижний Новгород, Нижегородская область",
    coords: { lat: 56.2965, lng: 43.9361 },
  },
];

export type StaticNearbyPlace = {
  city: string;
  region: string;
  displayName: string;
  lat: number;
  lng: number;
  distKm: number;
};

/** Extra entries for locality search coverage. */
export const STATIC_NEARBY_IZHEVSK: StaticNearbyPlace[] = [
  {
    city: "Завьялово",
    region: "Удмуртская Республика",
    displayName: "Завьялово, Удмуртская Республика",
    lat: 56.783,
    lng: 53.133,
    distKm: 13,
  },
  {
    city: "Якшур-Бодья",
    region: "Удмуртская Республика",
    displayName: "Якшур-Бодья, Удмуртская Республика",
    lat: 57.19,
    lng: 53.123,
    distKm: 33,
  },
];

/**
 * Filters merged global seeds ( hubs + cities.ts ). Case-insensitive; used for modal search suggestions only.
 */
export function filterGlobalRussiaCitiesByQuery(query: string): StaticRussiaCity[] {
  const qRaw = query.trim();
  const all = getGlobalRussiaCitiesForSearch();
  if (!qRaw) {
    return [...all].sort((a, b) => a.city.localeCompare(b.city, "ru"));
  }
  const variants = buildSearchVariants(qRaw);
  const hits = all.filter((c) => {
    const blob = `${c.city} ${c.region} ${c.displayName}`.toLowerCase();
    return variants.some((v) => blob.includes(v));
  });
  hits.sort((a, b) => {
    const ra = rankCitySuggestion(a, variants);
    const rb = rankCitySuggestion(b, variants);
    return ra !== rb ? ra - rb : a.city.localeCompare(b.city, "ru");
  });
  return hits;
}

/** @deprecated Prefer `filterGlobalRussiaCitiesByQuery`; forwards to merged global corpus. */
export function filterStaticRussiaCitiesByQuery(query: string): StaticRussiaCity[] {
  return filterGlobalRussiaCitiesByQuery(query);
}

export function findExactStaticRussiaCityMatch(input: string): StaticRussiaCity | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  for (const c of getGlobalRussiaCitiesForSearch()) {
    const cityLc = (c.city ?? "").trim().toLowerCase();
    const dispLc = (c.displayName ?? "").trim().toLowerCase();
    if (cityLc === t) return c;
    if (dispLc === t) return c;
    if ((c.city ?? "").trim() === (input ?? "").trim()) return c;
  }
  return null;
}

/** Row for «рядом» lists (full static corpus, not suggestion-sliced). */
export type NearbySettlementRow = {
  label: string;
  region: string;
  lat: number;
  lng: number;
  /** Distance from the active map circle center (km). */
  distanceFromCenterKm: number;
  /** True when shown beyond search radius to pad sparse areas. */
  outsideCircle?: boolean;
  cityKey: string;
};

/**
 * Widest static dataset for nearby / nearest-from-center calculations.
 * Uses the full merged hub list (no `slice`); adds `STATIC_NEARBY_*` extras without dedupe loss.
 *
 * Keep this function as the single entry point for `LocationModal` nearby logic.
 */
export function getAllRussiaSettlementsForNearby(): StaticRussiaCity[] {
  const out: StaticRussiaCity[] = [];
  const seen = new Set<string>();
  const add = (c: StaticRussiaCity) => {
    const cityK = (c.city ?? "").trim().toLowerCase();
    const regK = (c.region ?? "").trim().toLowerCase();
    if (!cityK || !Number.isFinite(c.coords.lat + c.coords.lng)) return;
    const key = `${cityK}|${regK}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      city: (c.city ?? "").trim(),
      region: (c.region ?? "").trim(),
      displayName: (c.displayName ?? "").trim() || `${(c.city ?? "").trim()}${regK ? `, ${(c.region ?? "").trim()}` : ""}`,
      coords: { lat: c.coords.lat, lng: c.coords.lng },
    });
  };
  for (const c of getGlobalRussiaCitiesForSearch()) add(c);
  for (const n of STATIC_NEARBY_IZHEVSK) {
    add({
      city: n.city,
      region: n.region,
      displayName: n.displayName,
      coords: { lat: n.lat, lng: n.lng },
    });
  }
  return out;
}

type ScoredSettlement = NearbySettlementRow;

function scoreAllFromCenter(centerLat: number, centerLng: number): ScoredSettlement[] {
  const out: ScoredSettlement[] = [];
  for (const c of getAllRussiaSettlementsForNearby()) {
    const cityK = (c.city ?? "").trim();
    const regK = (c.region ?? "").trim();
    if (!cityK || !Number.isFinite(c.coords.lat + c.coords.lng)) continue;
    const key = `${cityK.toLowerCase()}|${regK.toLowerCase()}`;
    const d = calculateDistanceKm(centerLat, centerLng, c.coords.lat, c.coords.lng);
    out.push({
      label: cityK,
      region: regK,
      lat: c.coords.lat,
      lng: c.coords.lng,
      distanceFromCenterKm: d,
      cityKey: key,
    });
  }
  return out;
}

/** Nearest named settlement in the full static dataset to a geographic point. */
export function findNearestSettlementRow(centerLat: number, centerLng: number): NearbySettlementRow | null {
  if (!Number.isFinite(centerLat + centerLng)) return null;
  const scored = scoreAllFromCenter(centerLat, centerLng);
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.distanceFromCenterKm - b.distanceFromCenterKm);
  return scored[0] ?? null;
}

const NEARBY_PANEL_MAX = 50;
const NEARBY_MIN_INSIDE_BEFORE_PAD = 10;

/**
 * Nearby panel: prefer settlements within `radiusKm` of center, sorted by distance.
 * If fewer than 10 fall inside the radius, pad with nearest outside the circle (marked `outsideCircle`)
 * until up to {@link NEARBY_PANEL_MAX} rows. Uses {@link getAllRussiaSettlementsForNearby} — never suggestion-sliced.
 */
export function buildNearbyPanelSettlements(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): NearbySettlementRow[] {
  if (!Number.isFinite(centerLat + centerLng) || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];

  const scored = scoreAllFromCenter(centerLat, centerLng);
  const inside = scored
    .filter((r) => r.distanceFromCenterKm <= radiusKm + 1e-6)
    .sort((a, b) => a.distanceFromCenterKm - b.distanceFromCenterKm || a.label.localeCompare(b.label, "ru"));
  const outside = scored
    .filter((r) => r.distanceFromCenterKm > radiusKm + 1e-6)
    .sort((a, b) => a.distanceFromCenterKm - b.distanceFromCenterKm || a.label.localeCompare(b.label, "ru"));

  if (inside.length >= NEARBY_MIN_INSIDE_BEFORE_PAD) {
    return inside.slice(0, NEARBY_PANEL_MAX).map((r) => ({ ...r, outsideCircle: false }));
  }

  const need = Math.max(0, NEARBY_PANEL_MAX - inside.length);
  const padded = outside.slice(0, need);
  return [
    ...inside.map((r) => ({ ...r, outsideCircle: false })),
    ...padded.map((r) => ({ ...r, outsideCircle: true })),
  ];
}
