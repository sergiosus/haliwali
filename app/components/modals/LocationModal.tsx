"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FEDERAL_DISTRICT_MARKERS, isFederalDistrictLabel } from "../../lib/russiaAdministrativeAreas";
import {
  incomingModalFieldsToScope,
  searchScopeWholeRussia,
  type IncomingLocationModalFields,
} from "../../lib/locationModalSearchScope";
import type { StoredLocationPickKind } from "../../lib/useStoredCity";
import {
  type SearchScopeLocation,
  legacyFieldsFromSearchScope,
  normalizeSearchScope,
} from "../../lib/searchScopeLocation";
import { YandexMapPicker } from "../maps/YandexMapPicker";
import type { MapCenter, MapSettlementMarker } from "../maps/YandexMapPicker";
import { getYandexMapsApiKey } from "../../lib/maps/yandexLoader";
import {
  filterGlobalRussiaCitiesByQuery,
  findStaticRussiaCityCoords,
  uniqueRegionsFromGlobalRussiaCityList,
  type StaticRussiaCity,
} from "../../lib/staticRussiaCities";
import { calculateDistanceKm, formatDistanceKm } from "@/lib/shared/geo";
import {
  isValidDetectedSettlement,
  looksLikeDistrictAdministrativeLabel,
  looksLikeRuralAutoSettlement,
} from "../../lib/russiaPlaceLabelHeuristics";
import { buildSearchVariants, matchesSearchVariantsInText } from "../../lib/utils/keyboardLayout";

type LatLng = { readonly lat: number; readonly lng: number };

type SettlementRecord = {
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lng: number;
};

type NearbySettlementWithDistance = SettlementRecord & { readonly distanceKm: number };

function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return 6371 * c;
}

function dedupeSettlementsForDisplay(rows: NearbySettlementWithDistance[]): NearbySettlementWithDistance[] {
  const out: NearbySettlementWithDistance[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${(r.name ?? "").trim().toLowerCase()}\0${(r.region ?? "").trim().toLowerCase()}`;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Strict circle list: same rows for nearby tab + map placemarks (client Haversine). */
type CircleSettlementRow = NearbySettlementWithDistance;

type NearestCleanSettlement = {
  name: string;
  lat: number;
  lng: number;
  region: string;
};

/** Unified shape for selecting a populated place on the map or from lists (clean-settlement rows + search picks). */
type PickableSettlement = {
  name: string;
  region: string;
  lat: number;
  lng: number;
};

/** Sole geographic radius for search, nearby API, markers, and selection (Haversine from {@link currentCircleCenter}). */
export const CIRCLE_RADIUS_KM = 100;

/** @deprecated Use {@link CIRCLE_RADIUS_KM} */
export const NEARBY_RADIUS_KM = CIRCLE_RADIUS_KM;

function isAcceptableGeoSettlementPick(s: SettlementRecord): boolean {
  const name = (s.name ?? "").trim();
  if (!name) return false;
  if (!isValidDetectedSettlement(name)) return false;
  if (looksLikeDistrictAdministrativeLabel(name)) return false;
  if (looksLikeRuralAutoSettlement(name)) return false;
  return true;
}

/** Prefer nearest clean city-like row; fall back to scanning nearby circle (static dataset, no external geocoder). */
async function fetchNearbyApi(
  center: LatLng,
  radiusKm: number,
  limit: number,
): Promise<{ items: NearbySettlementWithDistance[]; nearest: SettlementRecord | null }> {
  const url =
    `/api/geo/nearby-settlements?lat=${encodeURIComponent(String(center.lat))}` +
    `&lng=${encodeURIComponent(String(center.lng))}` +
    `&radiusKm=${encodeURIComponent(String(radiusKm))}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as
    | { items?: unknown; nearest?: unknown }
    | null;
  const itemsRaw = Array.isArray(j?.items) ? (j!.items as unknown[]) : [];
  const items: NearbySettlementWithDistance[] = itemsRaw
    .map((x) => x as Partial<NearbySettlementWithDistance>)
    .map((x) => ({
      name: String(x.name ?? "").trim(),
      region: String(x.region ?? "").trim(),
      lat: Number(x.lat),
      lng: Number(x.lng),
      distanceKm: Number((x as { distanceKm?: unknown }).distanceKm),
    }))
    .filter((x) => x.name && x.region && Number.isFinite(x.lat + x.lng) && Number.isFinite(x.distanceKm));
  const nearestRaw = j?.nearest && typeof j.nearest === "object" ? (j.nearest as Record<string, unknown>) : null;
  const nearest: SettlementRecord | null =
    nearestRaw
      ? {
          name: String(nearestRaw.name ?? "").trim(),
          region: String(nearestRaw.region ?? "").trim(),
          lat: Number(nearestRaw.lat),
          lng: Number(nearestRaw.lng),
        }
      : null;
  return {
    items,
    nearest:
      nearest && nearest.name && nearest.region && Number.isFinite(nearest.lat + nearest.lng) ? nearest : null,
  };
}

async function fetchCitiesApi(query: string): Promise<SettlementRecord[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `/api/cities?query=${encodeURIComponent(q)}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as { ok?: unknown; cities?: unknown } | null;
  const ok = Boolean(j && typeof j === "object" && j.ok === true);
  if (!ok) return [];
  const arr = Array.isArray(j?.cities) ? (j!.cities as unknown[]) : [];
  return arr
    .map((x) => x as { name?: unknown; region?: unknown; lat?: unknown; lng?: unknown })
    .map((x) => ({
      name: String(x.name ?? "").trim(),
      region: String(x.region ?? "").trim(),
      lat: Number(x.lat),
      lng: Number(x.lng),
    }))
    .filter((x) => x.name && x.region && Number.isFinite(x.lat + x.lng));
}

async function pickBestSettlementForGps(at: LatLng): Promise<PickableSettlement | null> {
  try {
    const { nearest, items } = await fetchNearbyApi(at, CIRCLE_RADIUS_KM, 500);
    if (nearest && isAcceptableGeoSettlementPick(nearest)) {
      return {
        name: nearest.name.trim(),
        region: (nearest.region ?? "").trim(),
        lat: nearest.lat,
        lng: nearest.lng,
      };
    }
    for (const row of items) {
      if (isAcceptableGeoSettlementPick(row)) {
        return {
          name: row.name.trim(),
          region: (row.region ?? "").trim(),
          lat: row.lat,
          lng: row.lng,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function isInsideCircle(lat: number, lng: number, center: MapCenter | null, radiusKm: number): boolean {
  if (!center || !Number.isFinite(center.lat + center.lng + lat + lng)) return false;
  return haversineDistanceKm(center, { lat, lng }) <= radiusKm + 1e-9;
}

/** Fallback map center when we need "somewhere" and have no coordinates. */
const DEFAULT_MAP_CENTER: MapCenter = { lat: 55.7558, lng: 37.6173 };
/** Whole Russia view (must NOT default to Moscow). */
const RUSSIA_WIDE_CENTER: MapCenter = { lat: 61.5, lng: 99 };
const RUSSIA_WIDE_ZOOM = 4;

function isInsideRussiaGeolocationBounds(lat: number, lng: number): boolean {
  return lat >= 41 && lat <= 82 && lng >= 19 && lng <= 190;
}

/** km — if persisted coords disagree with static city center by more than this, prefer static (fixes stale Ижевск vs Завьялово labels). */
const STATIC_COORD_RECONCILE_KM = 5;

type ModalSelectedLocation = {
  label: string;
  lat: number;
  lng: number;
  region?: string;
  type: SearchScopeLocation["type"];
};

function reconcileCoordsWithStatic(
  incoming: SearchScopeLocation,
  raw: IncomingLocationModalFields | null | undefined,
): { lat: number; lng: number } | null {
  let lat =
    typeof incoming.lat === "number" && Number.isFinite(incoming.lat) ? incoming.lat : undefined;
  let lng =
    typeof incoming.lng === "number" && Number.isFinite(incoming.lng) ? incoming.lng : undefined;
  if (lat === undefined && typeof raw?.lat === "number" && Number.isFinite(raw.lat)) lat = raw.lat;
  if (lng === undefined && typeof raw?.lng === "number" && Number.isFinite(raw.lng)) lng = raw.lng;

  if (incoming.type === "point") {
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat!, lng: lng! };
    return null;
  }

  if (incoming.type === "city" || incoming.type === "settlement") {
    const label = (incoming.label ?? "").trim();
    const region = (incoming.region ?? incoming.parentName ?? "").trim();
    const staticCoords = findStaticRussiaCityCoords(label, region);
    if (Number.isFinite(lat) && Number.isFinite(lng) && staticCoords) {
      const d = calculateDistanceKm(lat!, lng!, staticCoords.lat, staticCoords.lng);
      if (d > STATIC_COORD_RECONCILE_KM) return { lat: staticCoords.lat, lng: staticCoords.lng };
      return { lat: lat!, lng: lng! };
    }
    if (staticCoords) return { lat: staticCoords.lat, lng: staticCoords.lng };
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat!, lng: lng! };
    return null;
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat!, lng: lng! };
  return null;
}

/** Single source for label + coordinates shown in the input and on the map (reconciles stale lat/lng vs city label). */
function buildSelectedLocation(
  raw: IncomingLocationModalFields | null | undefined,
): ModalSelectedLocation | null {
  const incoming = incomingModalFieldsToScope(raw);
  if (incoming.type === "country") return null;

  const label = (incoming.label ?? "").trim();
  const region = (incoming.region ?? incoming.parentName ?? "").trim();
  const coords = reconcileCoordsWithStatic(incoming, raw);
  if (!coords) return null;

  return {
    label,
    lat: coords.lat,
    lng: coords.lng,
    region: region || undefined,
    type: incoming.type,
  };
}

export type LocationModalValue = IncomingLocationModalFields;

export type LocationModalChangePayload = {
  scope: SearchScopeLocation;
  city: string;
  region: string;
  displayName: string;
  radiusKm: number;
  lat?: number;
  lng?: number;
  pickKind: StoredLocationPickKind;
  district?: string;
};

function suggestionMatchesWholeRussia(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return false;
  if (q.includes("росси") || q.includes("росий")) return true;
  if (/^вся\b/.test(q)) return true;
  return q === "вр";
}

function buildChangePayload(scope: SearchScopeLocation): LocationModalChangePayload {
  const norm = normalizeSearchScope(scope);
  const L = legacyFieldsFromSearchScope(norm);
  return {
    scope: norm,
    city: L.city,
    region: L.region,
    displayName: L.displayName,
    radiusKm: L.radiusKm,
    lat: L.lat,
    lng: L.lng,
    pickKind: L.pickKind,
    district: L.district,
  };
}

function scopeFromStaticCity(row: StaticRussiaCity): SearchScopeLocation {
  const la = row.coords?.lat;
  const lo = row.coords?.lng;
  return normalizeSearchScope({
    type: "city",
    label: row.city.trim(),
    region: row.region.trim(),
    parentName: row.region.trim(),
    ...(typeof la === "number" &&
    Number.isFinite(la) &&
    typeof lo === "number" &&
    Number.isFinite(lo) ?
      { lat: la, lng: lo }
    : {}),
  });
}

function scopeFromRegionLabel(label: string): SearchScopeLocation {
  const trimmed = label.trim();
  if (isFederalDistrictLabel(trimmed)) {
    return normalizeSearchScope({
      type: "federal_district",
      label: trimmed,
      region: trimmed,
    });
  }
  return normalizeSearchScope({
    type: "region",
    label: trimmed,
    region: trimmed,
  });
}

function scopeFromSettlementSearchRow(s: {
  name: string;
  region: string;
  lat: number;
  lng: number;
}): SearchScopeLocation {
  const reg = (s.region ?? "").trim();
  return normalizeSearchScope({
    type: "city",
    label: (s.name ?? "").trim(),
    region: reg,
    parentName: reg,
    lat: s.lat,
    lng: s.lng,
  });
}

function inferScopeFromQuery(qRaw: string, apiCities: SettlementRecord[]): SearchScopeLocation | null {
  const q = qRaw.trim();
  if (!q) return null;
  if (suggestionMatchesWholeRussia(q)) return searchScopeWholeRussia();

  if (q.length < 2) return null;

  const variants = buildSearchVariants(q);

  const apiExact =
    apiCities.find((c) => variants.some((v) => (c.name ?? "").trim().toLowerCase() === v)) ??
    apiCities.find((c) => variants.some((v) => `${c.name}, ${c.region}`.toLowerCase().startsWith(v)));
  if (apiExact) return scopeFromSettlementSearchRow(apiExact);

  const cities = filterGlobalRussiaCitiesByQuery(q);
  const exact =
    cities.find((c) => variants.some((v) => c.city.toLowerCase() === v)) ??
    cities.find((c) => variants.some((v) => c.displayName.toLowerCase().startsWith(v)));
  const cityPick = exact ?? (cities.length === 1 ? cities[0] : null);
  if (cityPick) return scopeFromStaticCity(cityPick);

  const regionsAll = uniqueRegionsFromGlobalRussiaCityList();
  const regHits = regionsAll.filter((r) => matchesSearchVariantsInText(r, q));
  if (regHits.length === 1) return scopeFromRegionLabel(regHits[0]!);

  const fdHits = (FEDERAL_DISTRICT_MARKERS as readonly string[]).filter((d) =>
    matchesSearchVariantsInText(d, q),
  );
  if (fdHits.length === 1) return scopeFromRegionLabel(fdHits[0]!);

  return null;
}

function labelForScopeDraft(s: SearchScopeLocation): string {
  if (s.type === "country") return "Вся Россия";
  if (s.type === "federal_district" || s.type === "region") return (s.label || s.region || "").trim();
  if (s.type === "district") return (s.label || "").trim();
  const city = (s.label || "").trim();
  const reg = (s.region || s.parentName || "").trim();
  if (reg) return `${city}, ${reg}`;
  return city;
}

type MapTab = "map" | "nearby";

export function LocationModal({
  open,
  value,
  cities: _cities,
  onClose,
  onChange,
  variant: _variant = "browse",
  listingSubMode: _listingSubMode = "full",
  autoDetectOnOpen = false,
}: {
  open: boolean;
  value: LocationModalValue | null | undefined;
  cities: readonly string[];
  onClose: () => void;
  onChange: (next: LocationModalChangePayload) => void;
  variant?: "browse" | "listing";
  listingSubMode?: "full" | "mapOnly";
  /** Home location entry: request GPS once when opening «Вся Россия» — suggests a city without applying until user confirms with «Выбрать». */
  autoDetectOnOpen?: boolean;
}) {
  const [draftQuery, setDraftQuery] = useState("");
  const [chosenScope, setChosenScope] = useState<SearchScopeLocation | null>(null);
  /** Map circle center (updates on drag / click). */
  const [currentCircleCenter, setCurrentCircleCenter] = useState<MapCenter | null>(null);
  /** First city/settlement pick from list; fixed until next list pick (not map drag). */
  const [originalSelectedCenter, setOriginalSelectedCenter] = useState<MapCenter | null>(null);
  const [activeTab, setActiveTab] = useState<MapTab>("map");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  /** User chose «Вся Россия» while geo in flight — ignore late GPS. */
  const geoCancelledRef = useRef(false);
  /** User edited / picked location — do not apply late GPS suggestion. */
  const blockHomeAutoGeoRef = useRef(false);
  const hasKey = Boolean(getYandexMapsApiKey());

  const [geoAutoHint, setGeoAutoHint] = useState<string | null>(null);

  const valueSig = useMemo(() => JSON.stringify(value ?? null), [value]);

  const selectedLocation = useMemo(() => buildSelectedLocation(value), [valueSig, value]);

  const selectedCenter = useMemo((): MapCenter | null => {
    if (!selectedLocation || !Number.isFinite(selectedLocation.lat + selectedLocation.lng)) return null;
    return { lat: selectedLocation.lat, lng: selectedLocation.lng };
  }, [selectedLocation]);

  /** Browser GPS fix for map (distinct from circle center after pan). */
  const [userLocation, setUserLocation] = useState<MapCenter | null>(null);

  useEffect(() => {
    if (!open) {
      geoCancelledRef.current = false;
      blockHomeAutoGeoRef.current = false;
      setGeoAutoHint(null);
      setUserLocation(null);
      setCurrentCircleCenter(null);
      setOriginalSelectedCenter(null);
      setChosenScope(null);
      setDraftQuery("");
      setSuggestionsDismissed(false);
    } else {
      geoCancelledRef.current = false;
      blockHomeAutoGeoRef.current = false;
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const incoming = incomingModalFieldsToScope(value);
    const sel = buildSelectedLocation(value);
    const syncCenter: MapCenter | null =
      sel && Number.isFinite(sel.lat + sel.lng) ? { lat: sel.lat, lng: sel.lng } : null;

    // eslint-disable-next-line no-console
    console.log("[INPUT LOCATION SOURCE]", sel);
    // eslint-disable-next-line no-console
    console.log("[SELECTED LOCATION]", sel);
    // eslint-disable-next-line no-console
    console.log("[SELECTED CENTER]", syncCenter);

    setActiveTab("map");

    if (incoming.type === "country") {
      setChosenScope(searchScopeWholeRussia());
      setDraftQuery("");
      // Whole Russia: no radius circle (only for actual city/area picks)
      setCurrentCircleCenter(null);
      setOriginalSelectedCenter(null);
      inputRef.current?.focus();
      return;
    }

    if (sel && syncCenter) {
      setChosenScope(
        normalizeSearchScope({
          ...incoming,
          lat: syncCenter.lat,
          lng: syncCenter.lng,
        }),
      );
      setDraftQuery(labelForScopeDraft(incoming));
      setCurrentCircleCenter(syncCenter);
      setOriginalSelectedCenter(syncCenter);
      inputRef.current?.focus();
      return;
    }

    setChosenScope(
      incoming.type === "city" || incoming.type === "settlement" || incoming.type === "point" ?
        normalizeSearchScope(incoming)
      : null,
    );
    setDraftQuery(labelForScopeDraft(incoming));
    setCurrentCircleCenter(null);
    setOriginalSelectedCenter(null);
    inputRef.current?.focus();
  }, [open, valueSig]);

  /** Single source: Haversine from `currentCircleCenter`, ≤ {@link CIRCLE_RADIUS_KM}, deduped for display. */
  const [circleItems, setCircleItems] = useState<CircleSettlementRow[]>([]);
  const [circleNearest, setCircleNearest] = useState<NearestCleanSettlement | null>(null);

  useEffect(() => {
    if (!open || !currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) {
      setCircleItems([]);
      setCircleNearest(null);
      return;
    }
    let cancelled = false;
    void fetchNearbyApi(currentCircleCenter, CIRCLE_RADIUS_KM, 2000)
      .then(({ items, nearest }) => {
        if (cancelled) return;
        const strict = items.filter((s) => s.distanceKm <= CIRCLE_RADIUS_KM + 1e-9);
        setCircleItems(dedupeSettlementsForDisplay(strict));
        setCircleNearest(
          nearest && isInsideCircle(nearest.lat, nearest.lng, currentCircleCenter, CIRCLE_RADIUS_KM)
            ? { name: nearest.name, lat: nearest.lat, lng: nearest.lng, region: nearest.region }
            : null,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCircleItems([]);
        setCircleNearest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentCircleCenter?.lat, currentCircleCenter?.lng]);

  const settlementsInsideCircle = circleItems;
  const nearestFromClean = circleNearest;

  const qTrim = draftQuery.trim();

  const [apiCityRows, setApiCityRows] = useState<SettlementRecord[]>([]);
  const [apiCityError, setApiCityError] = useState<string>("");

  // Debounced query to /api/cities (PostgreSQL).
  useEffect(() => {
    if (!open) return;
    const q = qTrim;
    setApiCityError("");
    if (q.trim().length < 2) {
      setApiCityRows([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void fetchCitiesApi(q)
        .then((rows) => {
          if (cancelled) return;
          setApiCityRows(rows);
        })
        .catch(() => {
          if (cancelled) return;
          setApiCityRows([]);
          setApiCityError("Города временно недоступны");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, qTrim]);

  const applySuggestionSettlement = useCallback(
    (s: { name: string; region: string; lat: number; lng: number }, opts?: { fromAutoGeo?: boolean }) => {
      if (!opts?.fromAutoGeo) blockHomeAutoGeoRef.current = true;
      const name = (s.name ?? "").trim();
      const reg = (s.region ?? "").trim();
      if (!name || !Number.isFinite(s.lat + s.lng)) return;
      const scope = normalizeSearchScope({
        type: "city",
        label: name,
        region: reg,
        parentName: reg,
        lat: s.lat,
        lng: s.lng,
      });
      setChosenScope(scope);
      setDraftQuery(reg ? `${name}, ${reg}` : name);
      const c = { lat: s.lat, lng: s.lng };
      setOriginalSelectedCenter(c);
      setCurrentCircleCenter(c);
      setActiveTab("map");
      setSuggestionsDismissed(true);
      setGeoAutoHint(null);
      inputRef.current?.blur();
    },
    [],
  );

  /** Home location button (`autoDetectOnOpen`): GPS once → nearest clean city-like row via static settlements (no external geocoder). */
  useEffect(() => {
    if (!open || !autoDetectOnOpen) return;

    const incoming = incomingModalFieldsToScope(value);
    if (incoming.type !== "country") return;

    let cancelled = false;
    setGeoAutoHint(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoAutoHint("Не удалось определить город автоматически. Выберите вручную или на карте.");
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled || geoCancelledRef.current || blockHomeAutoGeoRef.current) return;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!Number.isFinite(lat + lng)) {
          setGeoAutoHint("Не удалось определить город автоматически. Выберите вручную или на карте.");
          return;
        }
        if (!isInsideRussiaGeolocationBounds(lat, lng)) {
          setGeoAutoHint("Не удалось определить город автоматически. Выберите вручную или на карте.");
          return;
        }
        if (cancelled || geoCancelledRef.current || blockHomeAutoGeoRef.current) return;

        const here: MapCenter = { lat, lng };
        void pickBestSettlementForGps(here).then((pick) => {
          if (cancelled || geoCancelledRef.current || blockHomeAutoGeoRef.current) return;
          if (!pick) {
            setGeoAutoHint("Не удалось определить город автоматически. Выберите вручную или на карте.");
            return;
          }
          setUserLocation(here);
          applySuggestionSettlement(pick, { fromAutoGeo: true });
        });
      },
      () => {
        if (cancelled || geoCancelledRef.current) return;
        setGeoAutoHint("Не удалось определить местоположение. Выберите город вручную.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [open, autoDetectOnOpen, valueSig, value, applySuggestionSettlement]);

  const suggestions = useMemo(() => {
    const rows: { key: string; line: string; scope: SearchScopeLocation }[] = [];
    if (qTrim.length < 2) return rows;
    if (suggestionsDismissed) return rows;

    const byNameRegion = new Set<string>();
    const nameRegionKey = (name: string, region: string) =>
      `${(name ?? "").trim().toLowerCase()}\0${(region ?? "").trim().toLowerCase()}`;

    const qVariants = buildSearchVariants(qTrim);
    const candidates = apiCityRows.map((s) => ({
      name: (s.name ?? "").trim(),
      region: (s.region ?? "").trim(),
      lat: s.lat,
      lng: s.lng,
    }));

    const rank = (name: string, region: string): [number, number, string, string] => {
      const n = name.toLowerCase();
      const r = region.toLowerCase();
      let kind = 9;
      for (const ql of qVariants) {
        if (!ql) continue;
        if (n === ql) {
          kind = 0;
          break;
        }
        if (kind > 1 && n.startsWith(ql)) kind = 1;
        else if (kind > 2 && n.includes(ql)) kind = 2;
        else if (kind > 3 && r.includes(ql)) kind = 3;
      }
      return [kind, name.length, r, n];
    };

    candidates.sort((a, b) => {
      const ra = rank(a.name, a.region);
      const rb = rank(b.name, b.region);
      if (ra[0] !== rb[0]) return ra[0] - rb[0];
      if (ra[1] !== rb[1]) return ra[1] - rb[1];
      if (ra[2] !== rb[2]) return ra[2].localeCompare(rb[2], "ru");
      return ra[3].localeCompare(rb[3], "ru");
    });

    for (const s of candidates) {
      const name = (s.name ?? "").trim();
      const reg = (s.region ?? "").trim();
      const nk = nameRegionKey(name, reg);
      if (byNameRegion.has(nk)) continue;
      byNameRegion.add(nk);
      rows.push({
        key: `d:${nk}|${s.lat}|${s.lng}`,
        line: reg ? `${name}, ${reg}` : name,
        scope: scopeFromSettlementSearchRow(s),
      });
      if (rows.length >= 6) break;
    }

    for (const c of filterGlobalRussiaCitiesByQuery(qTrim).slice(0, 28)) {
      const nk = nameRegionKey(c.city, c.region);
      if (byNameRegion.has(nk)) continue;
      byNameRegion.add(nk);
      rows.push({
        key: `c:${nk}`,
        line: `${c.city}, ${c.region}`,
        scope: scopeFromStaticCity(c),
      });
      if (rows.length >= 8) break;
    }

    const regionsAll = uniqueRegionsFromGlobalRussiaCityList();
    let regAdded = 0;
    for (const r of regionsAll) {
      if (!matchesSearchVariantsInText(r, qTrim)) continue;
      if (regAdded >= 14) break;
      regAdded++;
      const key = `reg:${r}`;
      rows.push({
        key,
        line: r,
        scope: scopeFromRegionLabel(r),
      });
      if (rows.length >= 8) break;
    }

    let fdAdded = 0;
    for (const d of FEDERAL_DISTRICT_MARKERS as readonly string[]) {
      if (!matchesSearchVariantsInText(d, qTrim)) continue;
      if (fdAdded >= 12) break;
      fdAdded++;
      rows.push({
        key: `fd:${d}`,
        line: d,
        scope: scopeFromRegionLabel(d),
      });
      if (rows.length >= 8) break;
    }

    return rows.filter((x) => x.scope.type !== "country").slice(0, 8);
  }, [qTrim, suggestionsDismissed, apiCityRows]);

  /**
   * Map geographic center: live drag/click (`currentCircleCenter`) wins; otherwise reconciled `selectedCenter`;
   * «Вся Россия» → whole Russia view (zoomed out), not Moscow.
   */
  const effectiveCircleCenter: MapCenter | null = useMemo(() => {
    if (!open) return null;
    if (
      currentCircleCenter &&
      Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)
    ) {
      return currentCircleCenter;
    }
    if (selectedCenter) return selectedCenter;
    const incoming = incomingModalFieldsToScope(value);
    if (incoming.type === "country") return RUSSIA_WIDE_CENTER;
    return null;
  }, [open, valueSig, value, currentCircleCenter?.lat, currentCircleCenter?.lng, selectedCenter?.lat, selectedCenter?.lng]);

  const distanceAnchor: MapCenter | null = useMemo(() => {
    if (!open) return null;
    if (
      originalSelectedCenter &&
      Number.isFinite(originalSelectedCenter.lat + originalSelectedCenter.lng)
    ) {
      return originalSelectedCenter;
    }
    if (selectedCenter) return selectedCenter;
    const incoming = incomingModalFieldsToScope(value);
    if (incoming.type === "country") return null;
    return null;
  }, [open, valueSig, value, originalSelectedCenter?.lat, originalSelectedCenter?.lng, selectedCenter?.lat, selectedCenter?.lng]);

  /** Remount map when persisted selection coordinates change (opens on Завьялово vs Ижевск). */
  const mapRemountKey = useMemo(
    () => `${selectedCenter?.lat ?? "none"}-${selectedCenter?.lng ?? "none"}`,
    [selectedCenter?.lat, selectedCenter?.lng],
  );

  const incomingType = useMemo(() => incomingModalFieldsToScope(value).type, [valueSig, value]);

  const mapZoom = incomingType === "country" ? RUSSIA_WIDE_ZOOM : 11;

  useEffect(() => {
    if (!open || !currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) {
      return;
    }
    let src: "geo" | "selected" | "last" | "fallback" = "fallback";
    if (
      userLocation &&
      haversineDistanceKm(userLocation, currentCircleCenter) * 1000 < 80
    ) {
      src = "geo";
    } else if (
      selectedCenter &&
      haversineDistanceKm(selectedCenter, currentCircleCenter) * 1000 < 80
    ) {
      src = "selected";
    } else {
      src = "last";
    }
    // eslint-disable-next-line no-console
    console.log("[CENTER SOURCE]", src);
    // eslint-disable-next-line no-console
    console.log("[CURRENT CIRCLE CENTER]", currentCircleCenter);
    // eslint-disable-next-line no-console
    console.log("[INSIDE CIRCLE COUNT]", settlementsInsideCircle.length);
  }, [open, currentCircleCenter, userLocation, selectedCenter, settlementsInsideCircle.length]);

  /** ± distance = originalSelectedCenter → currentCircleCenter (Task 8). Name when moved: nearest inside circle only. */
  const mapBottomLabel = useMemo(() => {
    if (
      !distanceAnchor ||
      !currentCircleCenter ||
      !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)
    ) {
      return "";
    }
    const anchor = distanceAnchor;
    const nearestLabel = (nearestFromClean?.name ?? "").trim();
    const persistedPickLabel = (selectedLocation?.label ?? "").trim();
    const chosenLabel =
      chosenScope &&
      (chosenScope.type === "city" ||
        chosenScope.type === "settlement" ||
        chosenScope.type === "point") ?
        (chosenScope.label ?? "").trim()
      : "";
    const deltaKm = Math.round(
      calculateDistanceKm(
        anchor.lat,
        anchor.lng,
        currentCircleCenter.lat,
        currentCircleCenter.lng,
      ),
    );
    const labelBase =
      deltaKm === 0 && (chosenLabel || persistedPickLabel) ?
        (chosenLabel || persistedPickLabel)
      : nearestLabel || chosenLabel || persistedPickLabel || "Локация";
    return `${labelBase} ± ${deltaKm} км`;
  }, [nearestFromClean, chosenScope, distanceAnchor, currentCircleCenter?.lat, currentCircleCenter?.lng, selectedLocation?.label]);

  const handleMapCenterChange = useCallback((center: MapCenter) => {
    setCurrentCircleCenter((prev) => {
      if (
        prev &&
        Math.abs(prev.lat - center.lat) < 1e-8 &&
        Math.abs(prev.lng - center.lng) < 1e-8
      ) {
        return prev;
      }
      return center;
    });
  }, []);

  const handleMapClick = useCallback((center: MapCenter) => {
    setCurrentCircleCenter(center);
  }, []);

  const handleGeolocationButtonForUserMarker = useCallback((c: MapCenter) => {
    blockHomeAutoGeoRef.current = true;
    if (!Number.isFinite(c.lat + c.lng)) return;
    if (!isInsideRussiaGeolocationBounds(c.lat, c.lng)) return;
    geoCancelledRef.current = false;
    setUserLocation(c);
  }, []);

  /** GPS marker click: nearest clean settlement (works even if circle center was panned away). */
  const handleUserLocationMarkerClick = useCallback((at: MapCenter) => {
    blockHomeAutoGeoRef.current = true;
    void fetchNearbyApi(at, CIRCLE_RADIUS_KM, 500).then(({ nearest, items }) => {
      const pick = (nearest && isAcceptableGeoSettlementPick(nearest))
        ? nearest
        : (items.find((x) => isAcceptableGeoSettlementPick(x)) ?? null);
      if (!pick) return;
      const reg = `${pick.region ?? ""}`.trim();
      const scope = normalizeSearchScope({
        type: "city",
        label: pick.name.trim(),
        region: reg,
        parentName: reg,
        lat: pick.lat,
        lng: pick.lng,
      });
      setChosenScope(scope);
      setDraftQuery(labelForScopeDraft(scope));
      const c = { lat: pick.lat, lng: pick.lng };
      setOriginalSelectedCenter(c);
      setCurrentCircleCenter(c);
      setActiveTab("map");
    });
  }, []);

  /** Single entry point for choosing a НП by coordinates: updates input, anchors, map center, keeps modal open. */
  const selectSettlement = useCallback((settlement: PickableSettlement) => {
    blockHomeAutoGeoRef.current = true;
    if (!currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) return;
    if (!isInsideCircle(settlement.lat, settlement.lng, currentCircleCenter, CIRCLE_RADIUS_KM)) return;
    const reg = (settlement.region ?? "").trim();
    const scope = normalizeSearchScope({
      type: "city",
      label: settlement.name.trim(),
      region: reg,
      parentName: reg,
      lat: settlement.lat,
      lng: settlement.lng,
    });
    setChosenScope(scope);
    setDraftQuery(labelForScopeDraft(scope));
    const c = { lat: settlement.lat, lng: settlement.lng };
    setOriginalSelectedCenter(c);
    setCurrentCircleCenter(c);
    setActiveTab("map");
  }, [currentCircleCenter?.lat, currentCircleCenter?.lng]);

  const settlementMarkersForMap = useMemo((): MapSettlementMarker[] => {
    if (!open) return [];
    if (!currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) return [];

    const samePoint = (la: number, lo: number, lb: number, ob: number) =>
      Math.abs(la - lb) < 1e-5 && Math.abs(lo - ob) < 1e-5;

    const out: MapSettlementMarker[] = [];
    const hasChosenCoords =
      chosenScope &&
      (chosenScope.type === "city" || chosenScope.type === "settlement") &&
      typeof chosenScope.lat === "number" &&
      Number.isFinite(chosenScope.lat) &&
      typeof chosenScope.lng === "number" &&
      Number.isFinite(chosenScope.lng);

    if (hasChosenCoords) {
      const lat = chosenScope.lat!;
      const lng = chosenScope.lng!;
      if (isInsideCircle(lat, lng, currentCircleCenter, CIRCLE_RADIUS_KM)) {
        const name = (chosenScope.label ?? "").trim();
        const region = (chosenScope.region ?? chosenScope.parentName ?? "").trim();
        out.push({
          key: `sel:${name}:${lat}:${lng}`,
          name,
          region,
          lat,
          lng,
          isSelected: true,
        });
      }
    }

    for (const row of settlementsInsideCircle) {
      if (out.length >= 50) break;
      if (hasChosenCoords && samePoint(row.lat, row.lng, chosenScope.lat!, chosenScope.lng!)) continue;
      out.push({
        key: `${row.name}:${row.lat}:${row.lng}`,
        name: row.name,
        region: row.region ?? "",
        lat: row.lat,
        lng: row.lng,
        isSelected: false,
      });
    }

    return out;
  }, [open, chosenScope, settlementsInsideCircle, currentCircleCenter?.lat, currentCircleCenter?.lng]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line no-console
    console.log("[MARKERS RENDERED COUNT]", settlementMarkersForMap.length);
  }, [open, settlementMarkersForMap.length]);

  const handleSettlementMarkerClick = useCallback(
    (m: MapSettlementMarker) => {
      selectSettlement({
        name: m.name,
        region: m.region,
        lat: m.lat,
        lng: m.lng,
      });
    },
    [selectSettlement],
  );

  function pickWholeRussia() {
    blockHomeAutoGeoRef.current = true;
    geoCancelledRef.current = true;
    setUserLocation(null);
    const scope = searchScopeWholeRussia();
    setChosenScope(scope);
    setDraftQuery(labelForScopeDraft(scope));
    // Whole Russia: no radius circle (only for actual city/area picks)
    setCurrentCircleCenter(null);
    setOriginalSelectedCenter(null);
  }

  function applyPick(scope: SearchScopeLocation) {
    blockHomeAutoGeoRef.current = true;
    if (
      (scope.type === "city" || scope.type === "settlement") &&
      typeof scope.lat === "number" &&
      Number.isFinite(scope.lat) &&
      typeof scope.lng === "number" &&
      Number.isFinite(scope.lng)
    ) {
      selectSettlement({
        name: (scope.label ?? "").trim(),
        region: (scope.region ?? scope.parentName ?? "").trim(),
        lat: scope.lat,
        lng: scope.lng,
      });
      return;
    }

    setChosenScope(scope);
    setDraftQuery(labelForScopeDraft(scope));
    setCurrentCircleCenter(DEFAULT_MAP_CENTER);
    setOriginalSelectedCenter(DEFAULT_MAP_CENTER);
  }

  function applyNearbyJsonPick(row: CircleSettlementRow) {
    selectSettlement({
      name: row.name.trim(),
      region: (row.region ?? "").trim(),
      lat: row.lat,
      lng: row.lng,
    });
  }

  function applySelection() {
    const scope = chosenScope ?? inferScopeFromQuery(draftQuery, apiCityRows);
    if (!scope) return;

    if (
      currentCircleCenter &&
      Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng) &&
      (scope.type === "city" || scope.type === "settlement") &&
      typeof scope.lat === "number" &&
      Number.isFinite(scope.lat) &&
      typeof scope.lng === "number" &&
      Number.isFinite(scope.lng)
    ) {
      if (!isInsideCircle(scope.lat, scope.lng, currentCircleCenter, CIRCLE_RADIUS_KM)) return;
    }

    const incoming = incomingModalFieldsToScope(value);

    const fromDragOrSession: MapCenter | null =
      currentCircleCenter && Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng) ?
        currentCircleCenter
      : null;

    const mapCenter: MapCenter | null =
      fromDragOrSession ?? selectedCenter ?? (effectiveCircleCenter && Number.isFinite(effectiveCircleCenter.lat + effectiveCircleCenter.lng) ? effectiveCircleCenter : null) ?? (incoming.type === "country" ? DEFAULT_MAP_CENTER : null);

    if (!mapCenter || !Number.isFinite(mapCenter.lat + mapCenter.lng)) {
      onChange(buildChangePayload(scope));
      onClose();
      return;
    }

    if (
      incoming.type !== "country" &&
      currentCircleCenter &&
      Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng) &&
      !isInsideCircle(mapCenter.lat, mapCenter.lng, currentCircleCenter, CIRCLE_RADIUS_KM)
    ) {
      return;
    }

    const withMap =
      (chosenScope?.type === "city" || chosenScope?.type === "settlement") &&
      Number.isFinite(mapCenter.lat) &&
      Number.isFinite(mapCenter.lng) ?
        normalizeSearchScope({
          ...scope,
          lat: mapCenter.lat,
          lng: mapCenter.lng,
        })
      : scope;

    onChange(buildChangePayload(withMap));
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-[min(92vw,700px)] max-w-[min(92vw,700px)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-1.5 pt-3 sm:px-4">
          <div id="loc-modal-title" className="text-[15px] font-semibold tracking-tight text-black/90">
            Локация
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-lg leading-none text-black/55 hover:bg-black/[0.03]"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-3 pt-0 sm:px-4">
          <div className="relative flex shrink-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-stretch gap-2">
              <input
                ref={inputRef}
                value={draftQuery}
                onChange={(e) => {
                  blockHomeAutoGeoRef.current = true;
                  setDraftQuery(e.target.value);
                  setChosenScope(null);
                  setSuggestionsDismissed(false);
                }}
                placeholder="Город или регион"
                className="h-10 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
              />
              <button
                type="button"
                onClick={pickWholeRussia}
                className="shrink-0 whitespace-nowrap rounded-xl border border-black/15 bg-white px-2.5 py-0 text-xs font-semibold leading-10 text-black/75 hover:bg-black/[0.03]"
              >
                Вся Россия
              </button>
            </div>

            {qTrim.length >= 2 && !suggestionsDismissed ?
              suggestions.length > 0 ?
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-black/[0.10] bg-white p-1 shadow-lg">
                  {suggestions.slice(0, 8).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="flex w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm text-black/85 hover:bg-black/[0.03]"
                      onClick={() => {
                        if (
                          (s.scope.type === "city" || s.scope.type === "settlement") &&
                          typeof s.scope.lat === "number" &&
                          Number.isFinite(s.scope.lat) &&
                          typeof s.scope.lng === "number" &&
                          Number.isFinite(s.scope.lng)
                        ) {
                          applySuggestionSettlement({
                            name: (s.scope.label ?? "").trim(),
                            region: (s.scope.region ?? s.scope.parentName ?? "").trim(),
                            lat: s.scope.lat,
                            lng: s.scope.lng,
                          });
                          return;
                        }
                        setSuggestionsDismissed(true);
                        applyPick(s.scope);
                      }}
                    >
                      {s.line}
                    </button>
                  ))}
                </div>
              : <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-black/[0.10] bg-white px-2 py-1 text-sm text-black/50 shadow-lg">
                  Ничего не найдено
                </div>
            : null}
            {geoAutoHint ? <div className="text-xs text-black/55">{geoAutoHint}</div> : null}
          </div>

          {!hasKey ?
            <div className="mt-1 rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 py-2.5 text-center text-sm text-black/55">
              Карта временно недоступна (нет API ключа)
            </div>
          : <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0">
                <div className="flex shrink-0 gap-0 border-b border-black/10">
                  <button
                    type="button"
                    className={
                      activeTab === "map" ?
                        "-mb-px border-b-2 border-orange-500 px-2.5 py-1.5 text-sm font-semibold text-black"
                      : "px-2.5 py-1.5 text-sm font-medium text-black/55 hover:text-black/80"
                    }
                    onClick={() => setActiveTab("map")}
                  >
                    Карта
                  </button>
                  <button
                    type="button"
                    className={
                      activeTab === "nearby" ?
                        "-mb-px border-b-2 border-orange-500 px-2.5 py-1.5 text-sm font-semibold text-black"
                      : "px-2.5 py-1.5 text-sm font-medium text-black/55 hover:text-black/80"
                    }
                    onClick={() => setActiveTab("nearby")}
                  >
                    Населённые пункты рядом
                  </button>
                </div>

                {activeTab === "map" ?
                  effectiveCircleCenter ?
                    <div className="flex flex-col gap-0">
                      <YandexMapPicker
                        key={mapRemountKey}
                        center={effectiveCircleCenter}
                        zoom={mapZoom}
                        className="min-h-[280px] h-[min(420px,52vh)] sm:h-[420px]"
                        onCenterChange={handleMapCenterChange}
                        onMapClick={handleMapClick}
                        settlementMarkers={settlementMarkersForMap}
                        onSettlementMarkerClick={handleSettlementMarkerClick}
                        userLocation={userLocation}
                        onUserLocationMarkerClick={handleUserLocationMarkerClick}
                        onGeolocationButtonSuccess={handleGeolocationButtonForUserMarker}
                        showViewportCircle={incomingType !== "country"}
                      />
                      {mapBottomLabel ?
                        <p className="text-center text-sm font-medium text-black/70">{mapBottomLabel}</p>
                      : null}
                    </div>
                  : <div className="min-h-[280px] rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 py-6 text-center text-sm text-black/55 sm:h-[420px]">
                      Нет координат для карты — выберите населённый пункт в списке.
                    </div>
                : <div className="min-h-[260px] rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5 sm:min-h-[300px]">
                    {settlementsInsideCircle.length > 0 ?
                      <ul className="max-h-[min(420px,52vh)] overflow-y-auto sm:max-h-[420px]">
                        {settlementsInsideCircle.map((row) => {
                          const reg = (row.region ?? "").trim();
                          const line =
                            reg ?
                              `${row.name}, ${reg}, ${formatDistanceKm(row.distanceKm)}`
                            : `${row.name}, ${formatDistanceKm(row.distanceKm)}`;
                          return (
                            <li key={`${row.name}:${row.lat}:${row.lng}`}>
                              <button
                                type="button"
                                className="flex w-full cursor-pointer rounded-lg px-2.5 py-2 text-left hover:bg-white"
                                onClick={() => applyNearbyJsonPick(row)}
                              >
                                <span className="text-sm font-medium text-black/90">{line}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    : <p className="px-3 py-6 text-center text-sm text-black/55">
                        В этом круге населённые пункты не найдены
                      </p>
                    }
                  </div>
                }
              </div>
          }

          <button
            type="button"
            className="mt-2.5 inline-flex h-10 w-full shrink-0 items-center justify-center self-center rounded-xl border border-black/12 bg-white px-5 text-sm font-semibold text-black/85 hover:bg-black/[0.03] sm:w-auto"
            onClick={applySelection}
          >
            Выбрать эту область
          </button>
        </div>
      </div>
    </div>
  );
}
