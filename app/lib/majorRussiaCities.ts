/** Static hubs for coarse auto-location when reverse geocode is rural-only or empty. */

export type CanonicalMajorCity = {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly region: string;
};

export type MajorRussiaCity = Pick<CanonicalMajorCity, "name" | "lat" | "lng">;

export type NearestMajorCityMatch = CanonicalMajorCity & { readonly distanceKm: number };

/** Seeded majors: canonical coords + subject region for UI (avoid rural GPS bleed). */
export const CANONICAL_MAJOR_RUSSIA_CITIES: readonly CanonicalMajorCity[] = [
  { name: "Ижевск", lat: 56.8527, lng: 53.2115, region: "Удмуртская Республика" },
  { name: "Уфа", lat: 54.7351, lng: 55.9587, region: "Республика Башкортостан" },
  { name: "Пермь", lat: 58.0105, lng: 56.2502, region: "Пермский край" },
  { name: "Казань", lat: 55.7961, lng: 49.1064, region: "Республика Татарстан" },
  { name: "Самара", lat: 53.1959, lng: 50.1008, region: "Самарская область" },
  { name: "Екатеринбург", lat: 56.8389, lng: 60.6057, region: "Свердловская область" },
  { name: "Москва", lat: 55.7558, lng: 37.6173, region: "г. Москва" },
  { name: "Санкт-Петербург", lat: 59.9311, lng: 30.3609, region: "г. Санкт-Петербург" },
  { name: "Севастополь", lat: 44.6167, lng: 33.5254, region: "г. Севастополь" },
  { name: "Ува", lat: 56.9908, lng: 52.1852, region: "Удмуртская Республика" },
];

export const MAJOR_RUSSIA_CITIES: readonly MajorRussiaCity[] = CANONICAL_MAJOR_RUSSIA_CITIES.map(({ name, lat, lng }) => ({
  name,
  lat,
  lng,
}));

/** Haversine distance in kilometres (`a`, `b` are `{ lat, lng }`; order must not swap). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** `maxKm === null` — ближайший из списка без ограничения (для авто-гео после более узкого радиуса). */
export function findNearestMajorRussiaCity(lat: number, lng: number, maxKm: number | null = 80): NearestMajorCityMatch | null {
  const from = { lat, lng };
  let best: NearestMajorCityMatch | null = null;
  for (const c of CANONICAL_MAJOR_RUSSIA_CITIES) {
    const distanceKm = haversineKm(from, { lat: c.lat, lng: c.lng });
    if (maxKm != null && distanceKm > maxKm) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { ...c, distanceKm };
    }
  }
  return best;
}

/** Largest-city centers get a wider “metro” cap for GPS label preference (nearby Москва SPB commuter belt). */
const GPS_PREF_MAJOR_RADIUS_KM_DEFAULT = 28;
const GPS_PREF_MAJOR_RADIUS_KM_MEGA = 42;

function majorCityGpsPreferenceRadiusKm(cityName: string): number {
  const k = cityName.trim().toLowerCase();
  if (k === "москва" || k === "санкт-петербург") return GPS_PREF_MAJOR_RADIUS_KM_MEGA;
  return GPS_PREF_MAJOR_RADIUS_KM_DEFAULT;
}

/**
 * Nearest seeded major whose center lies within that city’s urban preference radius of `lat`,`lng`.
 * Used to prefer a seeded regional capital over a closer micro‑settlement when both sit in the same agglomeration,
 * without replacing another seeded hub (see {@link getCanonicalMajorCityProfile} guards in snapping).
 */
export function findNearestCanonicalMajorForGpsLabelPreference(lat: number, lng: number): NearestMajorCityMatch | null {
  const from = { lat, lng };
  let best: NearestMajorCityMatch | null = null;
  for (const c of CANONICAL_MAJOR_RUSSIA_CITIES) {
    const distanceKm = haversineKm(from, { lat: c.lat, lng: c.lng });
    const cap = majorCityGpsPreferenceRadiusKm(c.name);
    if (distanceKm > cap) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { ...c, distanceKm };
    }
  }
  return best;
}

/** Center coordinates for seeded major cities. */
export function getMajorCityCoordsByName(name: string): { lat: number; lng: number } | null {
  const p = getCanonicalMajorCityProfile(name);
  return p ? { lat: p.lat, lng: p.lng } : null;
}

/** Normalizes user/geocoder locality strings before major-city lookup (`"г Ижевск"` → `"ижевск"`). */
export function normalizeMajorCityLookupKey(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  return s
    .replace(/^(г\.|г\s+|город\s+)/u, "")
    .replace(/(\s+г\.?)$/u, "")
    .trim();
}

/** Canonical coords + region for a seeded major city (case-insensitive name, tolerates `"г..."` prefixes). */
export function getCanonicalMajorCityProfile(trimmedCityName: string): CanonicalMajorCity | null {
  const key = normalizeMajorCityLookupKey(trimmedCityName);
  if (!key) return null;
  const row = CANONICAL_MAJOR_RUSSIA_CITIES.find((c) => normalizeMajorCityLookupKey(c.name) === key);
  return row ?? null;
}

/** Optional points within ~radius of a seeded center when dynamic geocoder returns sparse results. Distances validated with haversine. */
export type StaticNearbySettlement = {
  readonly city: string;
  readonly region?: string;
  readonly lat: number;
  readonly lng: number;
  /** UI label: город · село · деревня … */
  readonly kind?: string;
};

/** Key: normalized major-city name — keep small and explicit per user specs. */
export const STATIC_NEARBY_BY_MAJOR_CITY: Record<string, readonly StaticNearbySettlement[]> = {
  ува: [
    { city: "Ува-Тукля", region: "Удмуртская Республика", lat: 57.048, lng: 52.24, kind: "село" },
    { city: "Поршур-Тукля", region: "Удмуртская Республика", lat: 56.885, lng: 52.12, kind: "деревня" },
    { city: "Сюгаил", region: "Удмуртская Республика", lat: 56.97, lng: 52.45, kind: "село" },
  ],
  ижевск: [
    { city: "Завьялово", region: "Удмуртская Республика", lat: 56.8451, lng: 53.4254, kind: "село" },
    { city: "Хохряки", region: "Удмуртская Республика", lat: 56.917, lng: 53.134, kind: "деревня" },
    { city: "Якшур-Бодья", region: "Удмуртская Республика", lat: 56.5523, lng: 53.248, kind: "село" },
    /** ~52km from центра Ижевска → excluded when radius is 50km */
    { city: "Воткинск", region: "Удмуртская Республика", lat: 57.0487, lng: 53.9872, kind: "город" },
    { city: "Можга", region: "Удмуртская Республика", lat: 56.5583, lng: 52.1939, kind: "город" },
    { city: "Сарапул", region: "Удмуртская Республика", lat: 56.4783, lng: 53.8037, kind: "город" },
  ],
};

/** Settlements from static list whose haversine distance from `baseCoords` is within `radiusKm`. */
export function staticNearbyCandidatesForMajorCityHub(
  majorCityNormalized: string,
  baseCoords: { lat: number; lng: number },
  radiusKm = 50,
): StaticNearbySettlement[] {
  const list = STATIC_NEARBY_BY_MAJOR_CITY[majorCityNormalized.trim().toLowerCase()];
  if (!list?.length) return [];
  return list.filter((p) => haversineKm(baseCoords, { lat: p.lat, lng: p.lng }) <= radiusKm);
}
