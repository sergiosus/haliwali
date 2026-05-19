"use client";

import dynamic from "next/dynamic";
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
  replaceDeprecatedGpsUserLabelWithNeutral,
} from "../../lib/searchScopeLocation";
import type { MapCenter, MapSettlementMarker } from "../maps/YandexMapPicker";

const YandexMapPickerLazy = dynamic(() => import("./LocationModalYandexEmbed"), { ssr: false });
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
import {
  isInsideRussiaGeolocationBounds,
  pickBestSettlementAtCoords,
} from "../../lib/geoSettlementDetection";

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

/** Sole geographic radius for search, nearby API, markers, and selection (Haversine from settlement anchor center). */
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

function pickableFromSnapped(s: { name: string; region: string; lat: number; lng: number }): PickableSettlement {
  return {
    name: s.name.trim(),
    region: (s.region ?? "").trim(),
    lat: s.lat,
    lng: s.lng,
  };
}

function settlementRowMatchesChosenCity(
  row: PickableSettlement | CircleSettlementRow,
  chosen: SearchScopeLocation | null,
): boolean {
  if (
    !chosen ||
    (chosen.type !== "city" && chosen.type !== "settlement")
  )
    return false;
  const n = (chosen.label ?? "").trim().toLowerCase();
  const reg = (chosen.region ?? chosen.parentName ?? "").trim().toLowerCase();
  const rn = (row.name ?? "").trim().toLowerCase();
  const rr = ("region" in row ? row.region ?? "" : "").trim().toLowerCase();
  return Boolean(n && rn === n && reg && rr === reg);
}

function isInsideCircle(lat: number, lng: number, center: MapCenter | null, radiusKm: number): boolean {
  if (!center || !Number.isFinite(center.lat + center.lng + lat + lng)) return false;
  return haversineDistanceKm(center, { lat, lng }) <= radiusKm + 1e-9;
}

/** Whole Russia view (must NOT default to Moscow or any city). */
const RUSSIA_WIDE_CENTER: MapCenter = { lat: 61.5, lng: 99 };
const RUSSIA_WIDE_ZOOM = 4;

/** km — if persisted coords disagree with static city center by more than this, prefer static (avoids wrong labels). */
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

/**
 * True only when the incoming value is genuinely «Вся Россия».
 * `incomingModalFieldsToScope` can keep `type: "country"` while `lat`/`lng` + city persist — that must frame as city zoom, not Russia-wide.
 */
function incomingIsWholeRussia(v: IncomingLocationModalFields | null | undefined): boolean {
  const pk = `${v?.pickKind ?? ""}`.trim();
  if (pk === "whole") return true;
  const city = `${v?.city ?? ""}`.trim();
  const region = `${v?.region ?? ""}`.trim();
  const dn = `${v?.displayName ?? ""}`.trim();
  if (dn === "Вся Россия" && !city && !region) return true;

  const incoming = incomingModalFieldsToScope(v);
  const raw = rawCoordsFromIncoming(v);
  if (incoming.type === "country") {
    const placeText = city || region || `${incoming.label ?? ""}`.trim();
    if (raw && (placeText || (dn && dn !== "Вся Россия"))) return false;
    return true;
  }
  return false;
}

function rawCoordsFromIncoming(v: IncomingLocationModalFields | null | undefined): MapCenter | null {
  const la = typeof v?.lat === "number" && Number.isFinite(v.lat) ? v.lat : undefined;
  const lo = typeof v?.lng === "number" && Number.isFinite(v.lng) ? v.lng : undefined;
  if (la === undefined || lo === undefined) return null;
  return { lat: la, lng: lo };
}

function staticMapAnchorForRegionLikeScope(incoming: SearchScopeLocation): MapCenter | null {
  if (
    incoming.type !== "region" &&
    incoming.type !== "federal_district" &&
    incoming.type !== "district"
  ) {
    return null;
  }
  const label = `${incoming.label ?? ""}`.trim();
  const region = `${incoming.region ?? ""}`.trim();
  if (!label) return null;
  const c = findStaticRussiaCityCoords(label, region) ?? findStaticRussiaCityCoords(label, "");
  if (c && Number.isFinite(c.lat + c.lng)) return { lat: c.lat, lng: c.lng };
  return null;
}

/** Single source for label + coordinates shown in the input and on the map (reconciles stale lat/lng vs city label). */
function buildSelectedLocation(
  raw: IncomingLocationModalFields | null | undefined,
): ModalSelectedLocation | null {
  const incoming = incomingModalFieldsToScope(raw);
  if (incoming.type === "country") {
    if (incomingIsWholeRussia(raw)) return null;
    const city = `${raw?.city ?? ""}`.trim();
    const region = `${raw?.region ?? ""}`.trim();
    const label = city || region || `${incoming.label ?? ""}`.trim() || `${raw?.displayName ?? ""}`.trim();
    const synthetic = normalizeSearchScope({
      type: city ? "city" : region ? "region" : "city",
      label: label || "Локация",
      region: region || undefined,
      parentName: region || undefined,
      ...(() => {
        const c = rawCoordsFromIncoming(raw);
        return c ? { lat: c.lat, lng: c.lng } : {};
      })(),
    });
    const coords = reconcileCoordsWithStatic(synthetic, raw);
    if (!coords || !label) return null;
    return {
      label,
      lat: coords.lat,
      lng: coords.lng,
      region: region || undefined,
      type: synthetic.type,
    };
  }

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
  const displayFallback =
    norm.type === "country" ? "Вся Россия"
    : norm.type === "point" ? "Точка на карте"
    : L.displayName.trim() || "Точка на карте";
  const displayName = replaceDeprecatedGpsUserLabelWithNeutral(L.displayName, displayFallback);
  return {
    scope: norm,
    city: L.city,
    region: L.region,
    displayName,
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
  if (s.type === "federal_district" || s.type === "region")
    return replaceDeprecatedGpsUserLabelWithNeutral((s.label || s.region || "").trim(), "Точка на карте");
  if (s.type === "district")
    return replaceDeprecatedGpsUserLabelWithNeutral((s.label || "").trim(), "Точка на карте");
  const city = replaceDeprecatedGpsUserLabelWithNeutral((s.label || "").trim(), "Точка на карте");
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
  /** Homepage: no map / no Yandex scripts — search, list, apply only. */
  hideMapPreview = false,
  /** Listing create/edit: commit only explicit picks; never infer city from search draft on confirm. */
  listingFormMode = false,
}: {
  open: boolean;
  value: LocationModalValue | null | undefined;
  cities: readonly string[];
  onClose: () => void;
  onChange: (next: LocationModalChangePayload) => void;
  variant?: "browse" | "listing";
  listingSubMode?: "full" | "mapOnly";
  hideMapPreview?: boolean;
  listingFormMode?: boolean;
}) {
  const [draftQuery, setDraftQuery] = useState("");
  const [chosenScope, setChosenScope] = useState<SearchScopeLocation | null>(null);
  /** Geographic radius anchor (selected NP coords only — never updated by map pan / click). */
  const [currentCircleCenter, setCurrentCircleCenter] = useState<MapCenter | null>(null);
  /** First city/settlement pick from list; fixed until next list pick (not map drag). */
  const [originalSelectedCenter, setOriginalSelectedCenter] = useState<MapCenter | null>(null);
  const [activeTab, setActiveTab] = useState<MapTab>("map");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  /** Autocomplete list only after user types or focuses the input (not on geo/programmatic prefill). */
  const [allowSuggestDropdown, setAllowSuggestDropdown] = useState(false);
  /** User chose «Вся Россия» while geo in flight — ignore late GPS. */
  const geoCancelledRef = useRef(false);
  /** User edited / picked location — do not apply late GPS suggestion. */
  const blockHomeAutoGeoRef = useRef(false);
  /** Current map center under the Craigslist viewport overlay; used on «Выбрать эту область». Seeded from props, then `onCenterChange` from the map. */
  const viewportMapCenterForApplyRef = useRef<MapCenter | null>(null);
  /** Live geographic center (`map.getCenter`) for UI distance from {@link originalSelectedCenter}. */
  const [liveViewportMapCenter, setLiveViewportMapCenter] = useState<MapCenter | null>(null);
  /** Bump so {@link YandexMapPicker} animates back to {@link originalSelectedCenter}. */
  const [mapRecenterTick, setMapRecenterTick] = useState(0);
  const hasKey = Boolean(getYandexMapsApiKey());

  /** Geolocation suggestion only — never written to `chosenScope` until user confirms. */
  const [detectedSettlement, setDetectedSettlement] = useState<PickableSettlement | null>(null);
  /** Browser GPS fix for map (distinct from circle center after pan). */
  const [userLocation, setUserLocation] = useState<MapCenter | null>(null);

  const valueSig = useMemo(() => JSON.stringify(value ?? null), [value]);

  const selectedLocation = useMemo(() => buildSelectedLocation(value), [valueSig]);

  const selectedCenter = useMemo((): MapCenter | null => {
    if (!selectedLocation || !Number.isFinite(selectedLocation.lat + selectedLocation.lng)) return null;
    return { lat: selectedLocation.lat, lng: selectedLocation.lng };
  }, [selectedLocation]);

  const applySelectedLocation = useCallback(
    (normalizedScope: SearchScopeLocation, meta: { source: "init" | "search_suggestion" | "map_pick" | "nearby_json" | "geo_marker" }) => {
      const t = normalizedScope.type;
      if (
        t !== "city" &&
        t !== "settlement" &&
        t !== "point" &&
        t !== "region" &&
        t !== "federal_district" &&
        t !== "district"
      ) {
        return;
      }
      const la = normalizedScope.lat;
      const lo = normalizedScope.lng;
      if (typeof la !== "number" || typeof lo !== "number" || !Number.isFinite(la + lo)) return;

      if (meta.source !== "init") {
        blockHomeAutoGeoRef.current = true;
      }
      const norm = normalizeSearchScope({ ...normalizedScope, lat: la, lng: lo });
      const c = { lat: norm.lat!, lng: norm.lng! };

      setChosenScope(norm);
      setDraftQuery(labelForScopeDraft(norm));
      setOriginalSelectedCenter(c);
      setCurrentCircleCenter(c);
      setActiveTab(hideMapPreview ? "nearby" : "map");
      setSuggestionsDismissed(true);
      inputRef.current?.blur();
    },
    [hideMapPreview],
  );

  useEffect(() => {
    if (!open) {
      geoCancelledRef.current = false;
      blockHomeAutoGeoRef.current = false;
      setDetectedSettlement(null);
      setUserLocation(null);
      setCurrentCircleCenter(null);
      setOriginalSelectedCenter(null);
      setChosenScope(null);
      setDraftQuery("");
      setSuggestionsDismissed(false);
      setAllowSuggestDropdown(false);
    } else {
      geoCancelledRef.current = false;
      blockHomeAutoGeoRef.current = false;
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    setActiveTab(hideMapPreview ? "nearby" : "map");

    if (incomingIsWholeRussia(value)) {
      setChosenScope(searchScopeWholeRussia());
      setDraftQuery("");
      setCurrentCircleCenter(null);
      setOriginalSelectedCenter(null);
      setSuggestionsDismissed(false);
      inputRef.current?.focus();
      return;
    }

    const incoming = incomingModalFieldsToScope(value);
    const sel = buildSelectedLocation(value);
    const syncCenter: MapCenter | null =
      sel && Number.isFinite(sel.lat + sel.lng) ? { lat: sel.lat, lng: sel.lng } : null;

    if (sel && syncCenter) {
      applySelectedLocation(
        normalizeSearchScope({
          ...incoming,
          lat: syncCenter.lat,
          lng: syncCenter.lng,
        }),
        { source: "init" },
      );
      return;
    }

    const raw = rawCoordsFromIncoming(value);
    if (raw) {
      applySelectedLocation(normalizeSearchScope({ ...incoming, lat: raw.lat, lng: raw.lng }), { source: "init" });
      return;
    }

    const staticA = staticMapAnchorForRegionLikeScope(incoming);
    if (staticA) {
      applySelectedLocation(normalizeSearchScope({ ...incoming, lat: staticA.lat, lng: staticA.lng }), {
        source: "init",
      });
      return;
    }

    const coordsFromReconcile = reconcileCoordsWithStatic(incoming, value);
    if (
      coordsFromReconcile &&
      (incoming.type === "city" || incoming.type === "settlement" || incoming.type === "point")
    ) {
      applySelectedLocation(
        normalizeSearchScope({
          ...incoming,
          lat: coordsFromReconcile.lat,
          lng: coordsFromReconcile.lng,
        }),
        { source: "init" },
      );
      return;
    }

    if (incoming.type === "city" || incoming.type === "settlement") {
      const label = (incoming.label ?? "").trim();
      const region = (incoming.region ?? incoming.parentName ?? "").trim();
      const sta = findStaticRussiaCityCoords(label, region) ?? findStaticRussiaCityCoords(label, "");
      if (sta && Number.isFinite(sta.lat + sta.lng)) {
        applySelectedLocation(
          normalizeSearchScope({ ...incoming, lat: sta.lat, lng: sta.lng }),
          { source: "init" },
        );
        return;
      }
    }

    setChosenScope(
      incoming.type === "city" || incoming.type === "settlement" || incoming.type === "point" ?
        normalizeSearchScope(incoming)
      : null,
    );
    setDraftQuery(labelForScopeDraft(incoming));
    setCurrentCircleCenter(null);
    setOriginalSelectedCenter(null);
    setSuggestionsDismissed(false);
    inputRef.current?.focus();
  }, [open, valueSig, hideMapPreview, applySelectedLocation]);

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

  /** Hide the active city row from the «рядом» list so it is not a duplicate of the current selection. */
  const nearbyListRows = useMemo(
    () => settlementsInsideCircle.filter((row) => !settlementRowMatchesChosenCity(row, chosenScope)),
    [settlementsInsideCircle, chosenScope],
  );

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
      applySelectedLocation(
        normalizeSearchScope({
          type: "city",
          label: name,
          region: reg,
          parentName: reg,
          lat: s.lat,
          lng: s.lng,
        }),
        { source: "search_suggestion" },
      );
    },
    [applySelectedLocation],
  );

  /** Modal-only: nearest city suggestion for map/hint — does not change global filters until confirm. */
  useEffect(() => {
    if (!open) return;

    const incoming = incomingModalFieldsToScope(value);
    const hasCommittedCity =
      (incoming.type === "city" || incoming.type === "settlement") &&
      Boolean((incoming.label ?? "").trim()) &&
      typeof incoming.lat === "number" &&
      typeof incoming.lng === "number" &&
      Number.isFinite(incoming.lat + incoming.lng);

    if (hasCommittedCity && !incomingIsWholeRussia(value)) {
      setDetectedSettlement(null);
      return;
    }

    let cancelled = false;
    setDetectedSettlement(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled || geoCancelledRef.current || blockHomeAutoGeoRef.current) return;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!Number.isFinite(lat + lng) || !isInsideRussiaGeolocationBounds(lat, lng)) {
          return;
        }

        const here: MapCenter = { lat, lng };
        void pickBestSettlementAtCoords(here).then((pick) => {
          if (cancelled || geoCancelledRef.current || blockHomeAutoGeoRef.current) return;
          if (!pick) return;
          const p = pickableFromSnapped(pick);
          const anchor = { lat: p.lat, lng: p.lng };
          setDetectedSettlement(p);
          setUserLocation(here);
          setCurrentCircleCenter(anchor);
          viewportMapCenterForApplyRef.current = anchor;
          setLiveViewportMapCenter(anchor);
          setMapRecenterTick((n) => n + 1);
          const reg = (p.region ?? "").trim();
          const line = reg ? `${p.name}, ${reg}` : p.name;
          setDraftQuery((prev) => (prev.trim() ? prev : line));
        });
      },
      () => {
        if (cancelled || geoCancelledRef.current) return;
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 120_000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [open, valueSig, value]);

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
   * Map initial / prop-sync center: radius anchor coords or persisted selection; «Вся Россия» → whole Russia view.
   */
  const effectiveCircleCenter: MapCenter | null = useMemo(() => {
    if (!open) return null;
    if (
      currentCircleCenter &&
      Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)
    ) {
      return currentCircleCenter;
    }
    if (selectedCenter && Number.isFinite(selectedCenter.lat + selectedCenter.lng)) return selectedCenter;
    const rawParent = rawCoordsFromIncoming(value);
    if (rawParent) return rawParent;
    const incoming = incomingModalFieldsToScope(value);
    const draftIsWide = chosenScope?.type === "country" || incomingIsWholeRussia(value);
    if (
      detectedSettlement &&
      Number.isFinite(detectedSettlement.lat + detectedSettlement.lng) &&
      draftIsWide &&
      !currentCircleCenter
    ) {
      return { lat: detectedSettlement.lat, lng: detectedSettlement.lng };
    }
    if (draftIsWide) return RUSSIA_WIDE_CENTER;
    const staticA = staticMapAnchorForRegionLikeScope(incoming);
    if (staticA) return staticA;
    return null;
  }, [
    open,
    valueSig,
    value,
    currentCircleCenter?.lat,
    currentCircleCenter?.lng,
    selectedCenter?.lat,
    selectedCenter?.lng,
    detectedSettlement?.lat,
    detectedSettlement?.lng,
    chosenScope?.type,
  ]);

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

  /** Remount map when parent `value` or geo suggestion anchor changes (Russia-wide → detected city). */
  const mapRemountKey = useMemo(
    () =>
      `${valueSig}:${detectedSettlement?.lat ?? ""}:${detectedSettlement?.lng ?? ""}:${currentCircleCenter?.lat ?? ""}:${currentCircleCenter?.lng ?? ""}`,
    [
      valueSig,
      detectedSettlement?.lat,
      detectedSettlement?.lng,
      currentCircleCenter?.lat,
      currentCircleCenter?.lng,
    ],
  );

  const incomingType = useMemo(() => incomingModalFieldsToScope(value).type, [valueSig, value]);

  /** Whole-Russia framing only while the map is actually anchored on {@link RUSSIA_WIDE_CENTER} (viewport matches «Вся Россия» placeholder). Once the user picks a city/NP inside the modal while `value` may still say country until apply, zoom must jump to normal city scale or the circle is invisible at zoom 4. */
  const isRussiaWideMapCenter = useMemo(() => {
    const draftIsWide = chosenScope?.type === "country" || incomingIsWholeRussia(value);
    if (detectedSettlement && draftIsWide) return false;
    if (!effectiveCircleCenter || !Number.isFinite(effectiveCircleCenter.lat + effectiveCircleCenter.lng)) {
      return false;
    }
    return (
      Math.abs(effectiveCircleCenter.lat - RUSSIA_WIDE_CENTER.lat) < 1 &&
      Math.abs(effectiveCircleCenter.lng - RUSSIA_WIDE_CENTER.lng) < 2
    );
  }, [
    effectiveCircleCenter?.lat,
    effectiveCircleCenter?.lng,
    detectedSettlement?.lat,
    detectedSettlement?.lng,
    chosenScope?.type,
    valueSig,
    value,
  ]);

  const mapZoom = isRussiaWideMapCenter ? RUSSIA_WIDE_ZOOM : 11;

  useEffect(() => {
    if (!open) {
      viewportMapCenterForApplyRef.current = null;
      setLiveViewportMapCenter(null);
      return;
    }
    if (effectiveCircleCenter && Number.isFinite(effectiveCircleCenter.lat + effectiveCircleCenter.lng)) {
      viewportMapCenterForApplyRef.current = effectiveCircleCenter;
      setLiveViewportMapCenter(effectiveCircleCenter);
    }
  }, [open, effectiveCircleCenter?.lat, effectiveCircleCenter?.lng]);

  useEffect(() => {
    setMapRecenterTick(0);
  }, [effectiveCircleCenter?.lat, effectiveCircleCenter?.lng]);

  /**
   * One line under map: «City ± …» — distance from original selected NP to live `map.getCenter()`
   * (meters if &lt; 1 km, else km with one decimal under 10 km).
   */
  const mapBottomLabel = useMemo(() => {
    if (!open) return "";
    const anchor =
      originalSelectedCenter && Number.isFinite(originalSelectedCenter.lat + originalSelectedCenter.lng) ?
        originalSelectedCenter
      : distanceAnchor && Number.isFinite(distanceAnchor.lat + distanceAnchor.lng) ?
        distanceAnchor
      : null;
    const live =
      liveViewportMapCenter && Number.isFinite(liveViewportMapCenter.lat + liveViewportMapCenter.lng) ?
        liveViewportMapCenter
      : null;
    if (!anchor || !live) return "";

    const nearestLabel = (nearestFromClean?.name ?? "").trim();
    const persistedPickLabel = (selectedLocation?.label ?? "").trim();
    const chosenLabel =
      chosenScope &&
      (chosenScope.type === "city" ||
        chosenScope.type === "settlement" ||
        chosenScope.type === "point") ?
        (chosenScope.label ?? "").trim()
      : "";

    const dKm = calculateDistanceKm(anchor.lat, anchor.lng, live.lat, live.lng);
    if (!Number.isFinite(dKm)) return "";
    const meters = dKm * 1000;

    const labelBase =
      meters < 5 && (chosenLabel || persistedPickLabel) ?
        (chosenLabel || persistedPickLabel)
      : nearestLabel || chosenLabel || persistedPickLabel || "Локация";

    let distPart: string;
    if (meters < 5) {
      distPart = "0 км";
    } else if (meters < 1000) {
      distPart = `${Math.round(meters)} м`;
    } else {
      distPart =
        dKm < 10 ?
          dKm.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " км"
        : `${Math.round(dKm).toLocaleString("ru-RU")} км`;
    }
    return `${labelBase} ± ${distPart}`;
  }, [
    open,
    originalSelectedCenter?.lat,
    originalSelectedCenter?.lng,
    distanceAnchor?.lat,
    distanceAnchor?.lng,
    liveViewportMapCenter?.lat,
    liveViewportMapCenter?.lng,
    nearestFromClean,
    chosenScope,
    selectedLocation?.label,
  ]);

  /** Short NP name for «Вернуться к …» (same sources as {@link mapBottomLabel} headline). */
  const npNameForReturnButton = useMemo(() => {
    const nearestLabel = (nearestFromClean?.name ?? "").trim();
    const persistedPickLabel = (selectedLocation?.label ?? "").trim();
    const chosenLabel =
      chosenScope &&
      (chosenScope.type === "city" ||
        chosenScope.type === "settlement" ||
        chosenScope.type === "point") ?
        (chosenScope.label ?? "").trim()
      : "";
    return chosenLabel || persistedPickLabel || nearestLabel || "";
  }, [nearestFromClean?.name, chosenScope, selectedLocation?.label]);

  const showReturnToNpButton = useMemo(() => {
    if (
      !open ||
      !originalSelectedCenter ||
      !liveViewportMapCenter ||
      !Number.isFinite(originalSelectedCenter.lat + originalSelectedCenter.lng) ||
      !Number.isFinite(liveViewportMapCenter.lat + liveViewportMapCenter.lng)
    ) {
      return false;
    }
    const km = calculateDistanceKm(
      originalSelectedCenter.lat,
      originalSelectedCenter.lng,
      liveViewportMapCenter.lat,
      liveViewportMapCenter.lng,
    );
    return Number.isFinite(km) && km * 1000 >= 35;
  }, [
    open,
    originalSelectedCenter?.lat,
    originalSelectedCenter?.lng,
    liveViewportMapCenter?.lat,
    liveViewportMapCenter?.lng,
  ]);

  const handleGeolocationButtonForUserMarker = useCallback((c: MapCenter) => {
    blockHomeAutoGeoRef.current = true;
    if (!Number.isFinite(c.lat + c.lng)) return;
    if (!isInsideRussiaGeolocationBounds(c.lat, c.lng)) return;
    geoCancelledRef.current = false;
    setUserLocation(c);
  }, []);

  /** GPS marker click: nearest clean settlement (works even if circle center was panned away). */
  const handleUserLocationMarkerClick = useCallback(
    (at: MapCenter) => {
      blockHomeAutoGeoRef.current = true;
      void fetchNearbyApi(at, CIRCLE_RADIUS_KM, 500).then(({ nearest, items }) => {
        const pick =
          nearest && isAcceptableGeoSettlementPick(nearest) ?
            nearest
          : (items.find((x) => isAcceptableGeoSettlementPick(x)) ?? null);
        if (!pick) return;
        const reg = `${pick.region ?? ""}`.trim();
        applySelectedLocation(
          normalizeSearchScope({
            type: "city",
            label: pick.name.trim(),
            region: reg,
            parentName: reg,
            lat: pick.lat,
            lng: pick.lng,
          }),
          { source: "geo_marker" },
        );
      });
    },
    [applySelectedLocation],
  );

  /** Single entry point for choosing a НП by coordinates (map marker / circle list): containment vs current circle anchor. */
  const selectSettlement = useCallback(
    (settlement: PickableSettlement) => {
      if (!currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) return;
      if (!isInsideCircle(settlement.lat, settlement.lng, currentCircleCenter, CIRCLE_RADIUS_KM)) return;
      const reg = (settlement.region ?? "").trim();
      applySelectedLocation(
        normalizeSearchScope({
          type: "city",
          label: settlement.name.trim(),
          region: reg,
          parentName: reg,
          lat: settlement.lat,
          lng: settlement.lng,
        }),
        { source: "map_pick" },
      );
    },
    [applySelectedLocation, currentCircleCenter?.lat, currentCircleCenter?.lng],
  );

  const settlementMarkersForMap = useMemo((): MapSettlementMarker[] => {
    if (hideMapPreview) return [];
    if (!open) return [];
    if (!currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng)) return [];

    const samePoint = (la: number, lo: number, lb: number, ob: number) =>
      Math.abs(la - lb) < 1e-5 && Math.abs(lo - ob) < 1e-5;

    const out: MapSettlementMarker[] = [];
    const hasChosenCoords =
      chosenScope &&
      (chosenScope.type === "city" ||
        chosenScope.type === "settlement" ||
        chosenScope.type === "point") &&
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
  }, [
    open,
    chosenScope,
    settlementsInsideCircle,
    currentCircleCenter?.lat,
    currentCircleCenter?.lng,
    hideMapPreview,
  ]);

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
    setDetectedSettlement(null);
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
      applySelectedLocation(normalizeSearchScope(scope), { source: "search_suggestion" });
      return;
    }

    setChosenScope(scope);
    setDraftQuery(labelForScopeDraft(scope));
    setCurrentCircleCenter(null);
    setOriginalSelectedCenter(null);
  }

  function applyNearbyJsonPick(row: CircleSettlementRow) {
    applySelectedLocation(
      normalizeSearchScope({
        type: "city",
        label: row.name.trim(),
        region: (row.region ?? "").trim(),
        parentName: (row.region ?? "").trim(),
        lat: row.lat,
        lng: row.lng,
      }),
      { source: "nearby_json" },
    );
  }

  function resolveScopeForApply(): SearchScopeLocation | null {
    if (chosenScope && chosenScope.type !== "country") return chosenScope;

    if (!listingFormMode) {
      const inferred = inferScopeFromQuery(draftQuery, apiCityRows);
      if (inferred && inferred.type !== "country") return inferred;

      if (detectedSettlement && Number.isFinite(detectedSettlement.lat + detectedSettlement.lng)) {
        const reg = (detectedSettlement.region ?? "").trim();
        return normalizeSearchScope({
          type: "city",
          label: detectedSettlement.name.trim(),
          region: reg || undefined,
          parentName: reg || undefined,
          lat: detectedSettlement.lat,
          lng: detectedSettlement.lng,
        });
      }

      if (inferred) return inferred;
    }

    return chosenScope;
  }

  function applySelection() {
    const scope = resolveScopeForApply();
    if (!scope) return;

    const normScope = normalizeSearchScope(scope);
    if (normScope.type === "country") {
      onChange(buildChangePayload(normScope));
      onClose();
      return;
    }

    const coordsFromViewportPick: MapCenter | null =
      viewportMapCenterForApplyRef.current &&
      Number.isFinite(viewportMapCenterForApplyRef.current.lat + viewportMapCenterForApplyRef.current.lng) ?
        viewportMapCenterForApplyRef.current
      : null;

    const staticCircleAnchor: MapCenter | null =
      currentCircleCenter && Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng) ?
        currentCircleCenter
      : null;

    const containmentAnchor: MapCenter | null = coordsFromViewportPick ?? staticCircleAnchor;

    const scopeCoords: MapCenter | null =
      (normScope.type === "city" || normScope.type === "settlement" || normScope.type === "point") &&
      typeof normScope.lat === "number" &&
      Number.isFinite(normScope.lat) &&
      typeof normScope.lng === "number" &&
      Number.isFinite(normScope.lng) ?
        { lat: normScope.lat, lng: normScope.lng }
      : null;

    const anchorCenter: MapCenter | null = coordsFromViewportPick ?? staticCircleAnchor;

    const coordsForPayload: MapCenter | null = listingFormMode
      ? scopeCoords ?? staticCircleAnchor ?? null
      : coordsFromViewportPick ??
        scopeCoords ??
        staticCircleAnchor ??
        (selectedCenter && Number.isFinite(selectedCenter.lat + selectedCenter.lng) ? selectedCenter : null) ??
        (effectiveCircleCenter && Number.isFinite(effectiveCircleCenter.lat + effectiveCircleCenter.lng) ?
          effectiveCircleCenter
        : null);

    const confirmedFromBrowseDraft =
      !listingFormMode &&
      chosenScope?.type === "country" &&
      (normScope.type === "city" || normScope.type === "settlement" || normScope.type === "point");

    const explicitListPick =
      Boolean(chosenScope && chosenScope.type !== "country");

    if (
      explicitListPick &&
      !confirmedFromBrowseDraft &&
      containmentAnchor &&
      Number.isFinite(containmentAnchor.lat + containmentAnchor.lng) &&
      scopeCoords &&
      (normScope.type === "city" || normScope.type === "settlement") &&
      !isInsideCircle(scopeCoords.lat, scopeCoords.lng, containmentAnchor, CIRCLE_RADIUS_KM)
    ) {
      return;
    }

    if (!coordsForPayload || !Number.isFinite(coordsForPayload.lat + coordsForPayload.lng)) {
      onChange(buildChangePayload(normScope));
      onClose();
      return;
    }

    const incoming = incomingModalFieldsToScope(value);

    if (
      !listingFormMode &&
      !confirmedFromBrowseDraft &&
      incoming.type !== "country" &&
      anchorCenter &&
      Number.isFinite(anchorCenter.lat + anchorCenter.lng) &&
      !isInsideCircle(coordsForPayload.lat, coordsForPayload.lng, anchorCenter, CIRCLE_RADIUS_KM)
    ) {
      return;
    }

    const withMap =
      (normScope.type === "city" ||
        normScope.type === "settlement" ||
        (listingFormMode ? false : normScope.type === "point")) &&
      Number.isFinite(coordsForPayload.lat) &&
      Number.isFinite(coordsForPayload.lng) ?
        normalizeSearchScope({
          ...normScope,
          lat: coordsForPayload.lat,
          lng: coordsForPayload.lng,
        })
      : normScope;

    onChange(buildChangePayload(withMap));
    onClose();
  }

  if (!open) return null;

  const noCircleAnchorYet =
    !currentCircleCenter || !Number.isFinite(currentCircleCenter.lat + currentCircleCenter.lng);

  const nearbyScrollListPanel = (
    <div className="min-h-[260px] rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5 sm:min-h-[300px]">
      {nearbyListRows.length > 0 ?
        <ul className="max-h-[min(360px,48dvh)] overflow-y-auto sm:max-h-[360px]">
          {nearbyListRows.map((row) => {
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
  );

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-3 pt-[max(0.75rem,calc(0.75rem+env(safe-area-inset-top)))] pb-[max(0.75rem,calc(0.75rem+env(safe-area-inset-bottom)))] supports-[backdrop-filter]:[@media(hover:hover)_and_(pointer:fine)]:backdrop-blur-sm sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-0 max-h-[90dvh] w-[min(96vw,600px)] max-w-[min(96vw,600px)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl sm:max-h-[90vh]">
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2 pt-3 sm:px-5 sm:pb-2.5 sm:pt-3.5">
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] pt-0 sm:px-5 sm:pb-4">
          <div className="relative flex shrink-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-stretch gap-2">
              <input
                ref={inputRef}
                value={draftQuery}
                onChange={(e) => {
                  blockHomeAutoGeoRef.current = true;
                  setAllowSuggestDropdown(true);
                  setDraftQuery(e.target.value);
                  setChosenScope(null);
                  setSuggestionsDismissed(false);
                }}
                onFocus={(e) => {
                  if (e.nativeEvent.isTrusted) setAllowSuggestDropdown(true);
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

          </div>

          {hideMapPreview ?
            <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0">
              <div className="shrink-0 border-b border-black/10 pb-1.5 pt-0">
                <span className="text-sm font-semibold text-black">Населённые пункты рядом</span>
              </div>
              {noCircleAnchorYet ?
                <div className="mt-1 min-h-[200px] rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 py-6 text-center text-sm text-black/55">
                  Выберите город или населённый пункт в поле выше или нажмите «Вся Россия».
                </div>
              : nearbyScrollListPanel}
            </div>
          : !hasKey ?
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
                      <YandexMapPickerLazy
                        key={mapRemountKey}
                        center={effectiveCircleCenter}
                        zoom={mapZoom}
                        className="aspect-square w-full min-h-[288px] max-h-[min(46dvh,92vw)] sm:min-h-[320px] sm:max-h-[min(42vh,560px)]"
                        settlementMarkers={settlementMarkersForMap}
                        onSettlementMarkerClick={handleSettlementMarkerClick}
                        userLocation={userLocation}
                        onUserLocationMarkerClick={handleUserLocationMarkerClick}
                        onGeolocationButtonSuccess={handleGeolocationButtonForUserMarker}
                        viewportSearchOverlay
                        onCenterChange={(c) => {
                          viewportMapCenterForApplyRef.current = c;
                          setLiveViewportMapCenter(c);
                        }}
                        recenterTick={mapRecenterTick}
                        recenterTarget={originalSelectedCenter}
                      />
                      {mapBottomLabel || showReturnToNpButton ?
                        <div className="mt-1.5 space-y-1 text-center">
                          {mapBottomLabel ?
                            <p className="text-sm font-medium text-black/70">{mapBottomLabel}</p>
                          : null}
                          {showReturnToNpButton && originalSelectedCenter ?
                            <button
                              type="button"
                              className="mx-auto block text-xs font-medium text-blue-700/90 underline-offset-2 hover:underline"
                              onClick={() => {
                                if (!Number.isFinite(originalSelectedCenter.lat + originalSelectedCenter.lng)) return;
                                viewportMapCenterForApplyRef.current = originalSelectedCenter;
                                setLiveViewportMapCenter(originalSelectedCenter);
                                setMapRecenterTick((n) => n + 1);
                              }}
                            >
                              {npNameForReturnButton ?
                                `Вернуться к ${npNameForReturnButton}`
                              : "Вернуться к выбранному НП"}
                            </button>
                          : null}
                        </div>
                      : null}
                    </div>
                  : <div className="flex aspect-square w-full min-h-[288px] max-h-[min(46dvh,92vw)] items-center justify-center rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 py-6 text-center text-sm text-black/55 sm:min-h-[320px] sm:max-h-[min(42vh,560px)]">
                      Нет координат для карты — выберите населённый пункт в списке.
                    </div>
                : nearbyScrollListPanel}
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
