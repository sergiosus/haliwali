import { calculateDistanceKm, formatDistanceKm } from "@/lib/shared/geo";
import {
  STATIC_NEARBY_BY_MAJOR_CITY,
  haversineKm,
  normalizeMajorCityLookupKey,
  type StaticNearbySettlement,
} from "./majorRussiaCities";
import { STATIC_RF_CITIES } from "./staticRussiaCities";

export type NearbySettlementBrowseRow = {
  id: string;
  /** Example: `Ува — посёлок · Увинский район · 7,2 км` or `Ижевск — город · 42 км`. */
  labelLine: string;
  distanceText: string;
  distanceKm: number;
};

type SeedPlace = StaticNearbySettlement & { readonly district?: string };

/**
 * REPLACEABLE MVP: coarse coords around Ува / центральная Удмуртия for «Рядом» QA.
 * Do not rely on cadastral precision; replace with PostGIS/OSM later.
 */
const UVA_AREA_NEARBY_FALLBACK: readonly SeedPlace[] = [
  {
    city: "Ува",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 56.9908,
    lng: 52.1852,
    kind: "посёлок",
  },
  {
    city: "Ува-Тукля",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 57.03,
    lng: 52.22,
    kind: "село",
  },
  {
    city: "Поршур-Тукля",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 56.878,
    lng: 52.102,
    kind: "деревня",
  },
  {
    city: "Новый Мултан",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 56.92,
    lng: 52.48,
    kind: "деревня",
  },
  {
    city: "Пачегурт",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 56.932,
    lng: 52.31,
    kind: "село",
  },
  {
    city: "Какмож",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 57.01,
    lng: 52.34,
    kind: "село",
  },
  {
    city: "Нюрды-Котья",
    region: "Удмуртская Республика",
    district: "Увинский район",
    lat: 56.96,
    lng: 52.39,
    kind: "деревня",
  },
];

function isRoughUdmurtUvaPlateau(lat: number, lng: number): boolean {
  return lat >= 55.95 && lat <= 57.45 && lng >= 51 && lng <= 54.2;
}

function stripSettlementTypePrefixLc(rawLc: string): string {
  return rawLc
    .trim()
    .replace(
      /^(село|деревня|посёлок|поселок|пгт|ст-ца|станица|рабочий\s+посёлок|рабочий\s+поселок|дер\.)\s+/u,
      "",
    )
    .replace(/^п\.\s*/u, "")
    .trim();
}

/** "село Ува-Тукля" → { name: "Ува-Тукля", kind: "село" } for list label lines. */
function anchorDisplayNameAndKind(anchorLabel: string, kindFallback: string): { name: string; kind: string } {
  const t = anchorLabel.trim();
  if (!t) return { name: "Выбранный пункт", kind: kindFallback };
  const lc = t.toLowerCase();
  const m = lc.match(
    /^(рабочий\s+посёлок|рабочий\s+поселок|село|деревня|посёлок|поселок|пгт|ст-ца|станица|дер\.|п\.)\s+/u,
  );
  if (!m) return { name: t, kind: kindFallback };
  const stripped = stripSettlementTypePrefixLc(lc);
  if (!stripped) return { name: t, kind: kindFallback };
  const tail = t.slice(lc.length - stripped.length).trim();
  const kindMap: Record<string, string> = {
    село: "село",
    деревня: "деревня",
    посёлок: "посёлок",
    поселок: "посёлок",
    пгт: "пгт",
    "ст-ца": "станица",
    станица: "станица",
    п: "посёлок",
    дер: "деревня",
  };
  const rawKind = m[1].trim().replace(/\.$/u, "").toLowerCase().replace(/\s+/gu, " ");
  const k =
    rawKind === "рабочий посёлок" || rawKind === "рабочий поселок" ? "посёлок"
    : rawKind === "ст-ца" ? "станица"
    : kindMap[rawKind] ?? kindFallback;
  return { name: tail || t, kind: k };
}

function rowIdStable(name: string, region?: string) {
  return `${normalizeMajorCityLookupKey(name)}|${(region ?? "").trim().toLowerCase()}`;
}

function anchorNameKeys(anchorLabel: string): Set<string> {
  const trimmed = anchorLabel.trim();
  const ks = new Set<string>();
  if (!trimmed) return ks;
  ks.add(normalizeMajorCityLookupKey(trimmed));
  ks.add(normalizeMajorCityLookupKey(stripSettlementTypePrefixLc(trimmed.toLowerCase())));
  return ks;
}

function formatLabel(name: string, kind: string, district: string | undefined, dt: string): string {
  if (district && district.trim()) {
    return `${name.trim()}, ${kind} · ${district.trim()} · ${dt}`;
  }
  return `${name.trim()}, ${kind} · ${dt}`;
}

/**
 * All settlements seeded in STATIC_NEARBY_BY_MAJOR_CITY (any hub), distance-filtered by map center + radiusKm.
 */
function pushNearbyFromMajorCityTables(
  items: { name: string; kind: string; region?: string; district?: string; d: number }[],
  anchorKeys: Set<string>,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): void {
  for (const list of Object.values(STATIC_NEARBY_BY_MAJOR_CITY)) {
    for (const p of list) {
      const d = haversineKm({ lat: centerLat, lng: centerLng }, { lat: p.lat, lng: p.lng });
      if (!Number.isFinite(d) || d > radiusKm + 1e-6) continue;
      const k = normalizeMajorCityLookupKey(p.city);
      if (anchorKeys.has(k)) continue;
      items.push({
        name: p.city,
        kind: p.kind ?? "населённый пункт",
        region: p.region,
        district: undefined,
        d,
      });
    }
  }
}

function pushUvaPlateauFallback(
  items: { name: string; kind: string; region?: string; district?: string; d: number }[],
  anchorKeys: Set<string>,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): void {
  if (!isRoughUdmurtUvaPlateau(centerLat, centerLng)) return;
  for (const p of UVA_AREA_NEARBY_FALLBACK) {
    const d = haversineKm({ lat: centerLat, lng: centerLng }, { lat: p.lat, lng: p.lng });
    if (!Number.isFinite(d) || d > radiusKm + 1e-6) continue;
    const sk = normalizeMajorCityLookupKey(p.city);
    if (anchorKeys.has(sk)) continue;
    items.push({
      name: p.city,
      kind: p.kind ?? "населённый пункт",
      region: p.region,
      district: p.district,
      d,
    });
  }
}

/**
 * Local/static fallback for «Рядом» until a geocoder API backs this.
 * Does not throw; returns [] on bad inputs.
 *
 * Rows: `Ува — посёлок · 7 км` or with district before distance when present.
 */
export function nearbySettlementsForBrowseFallback(
  anchorLabel: string,
  anchorKindRu: string,
  anchorRegion: string | undefined,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): NearbySettlementBrowseRow[] {
  if (!Number.isFinite(centerLat + centerLng + radiusKm) || radiusKm <= 0) return [];

  const kind0 = (anchorKindRu || "").trim() || "город";
  const anchorKeys = anchorNameKeys(anchorLabel);
  const trimmedAnchor = (anchorLabel || "").trim() || "Выбранный пункт";
  const anchorDisp = anchorDisplayNameAndKind(trimmedAnchor, kind0);
  const items: { name: string; kind: string; region?: string; district?: string; d: number }[] = [];

  items.push({
    name: anchorDisp.name,
    kind: anchorDisp.kind,
    region: (anchorRegion ?? "").trim() || undefined,
    district: undefined,
    d: 0,
  });

  pushNearbyFromMajorCityTables(items, anchorKeys, centerLat, centerLng, radiusKm);
  pushUvaPlateauFallback(items, anchorKeys, centerLat, centerLng, radiusKm);

  for (const c of STATIC_RF_CITIES) {
    const d = calculateDistanceKm(centerLat, centerLng, c.coords.lat, c.coords.lng);
    if (!Number.isFinite(d) || d > radiusKm) continue;
    const ck = normalizeMajorCityLookupKey(c.city);
    if (anchorKeys.has(ck)) continue;

    items.push({ name: c.city, kind: "город", region: c.region, district: undefined, d });
  }

  items.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name, "ru"));
  const nameSeen = new Set<string>();
  const uniqByNameClosest = items.filter((x) => {
    const nk = normalizeMajorCityLookupKey(x.name);
    if (nameSeen.has(nk)) return false;
    nameSeen.add(nk);
    return true;
  });

  uniqByNameClosest.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name, "ru"));

  return uniqByNameClosest.map((x) => {
    const dt = formatDistanceKm(x.d);
    return {
      id: rowIdStable(x.name, x.region),
      labelLine: formatLabel(x.name, x.kind, x.district, dt),
      distanceText: dt,
      distanceKm: x.d,
    };
  });
}
