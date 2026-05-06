"use client";

import { useSyncExternalStore } from "react";
import { looksLikeRuralAutoSettlement } from "./russiaPlaceLabelHeuristics";
import {
  DEFAULT_SEARCH_SCOPE,
  type SearchScopeLocation,
  normalizeSearchScope,
  legacyFieldsFromSearchScope,
  searchScopeFromLegacySnapshot,
  type LegacyLocationSnapshot,
} from "./searchScopeLocation";

const CITY_KEY = "haliwali_city";
const CITY_DISPLAY_NAME_KEY = "haliwali_city_display_name";
const CITY_RADIUS_KM_KEY = "haliwali_city_radius_km";
const CITY_LAT_KEY = "haliwali_city_lat";
const CITY_LNG_KEY = "haliwali_city_lng";
const CITY_REGION_KEY = "haliwali_city_region";
const CITY_DISTRICT_KEY = "haliwali_city_district_label";
const CITY_PICK_KIND_KEY = "haliwali_city_pick_kind"; // whole | settlement | region | district | point
/** Канонический JSON фильтра локации (см. `searchScopeLocation.ts`). */
const CITY_SEARCH_SCOPE_KEY = "haliwali_search_scope_v1";
const CITY_SOURCE_KEY = "haliwali_city_source"; // "manual" | "auto"
const CITY_AUTO_TS_KEY = "haliwali_city_auto_ts";
const EMPTY_CITY = "";

/** Stable server/SSR snapshots for useSyncExternalStore (no fresh [] / {} / "" closure per render). */
const SERVER_EMPTY_STRING = "";
const SERVER_ZERO = 0;
const SERVER_NULL_NUMBER: null = null;

function getServerSnapshotEmptyString(): string {
  return SERVER_EMPTY_STRING;
}

function getServerSnapshotNullNumber(): null {
  return SERVER_NULL_NUMBER;
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window === "undefined") return () => listeners.delete(callback);

  const onStorage = (e: StorageEvent) => {
    if (
      e.key === CITY_KEY ||
      e.key === CITY_RADIUS_KM_KEY ||
      e.key === CITY_LAT_KEY ||
      e.key === CITY_LNG_KEY ||
      e.key === CITY_REGION_KEY ||
      e.key === CITY_DISTRICT_KEY ||
      e.key === CITY_PICK_KIND_KEY ||
      e.key === CITY_DISPLAY_NAME_KEY ||
      e.key === CITY_SOURCE_KEY ||
      e.key === CITY_SEARCH_SCOPE_KEY
    )
      emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  if (typeof window === "undefined") return EMPTY_CITY;
  return localStorage.getItem(CITY_KEY) ?? EMPTY_CITY;
}

function getServerSnapshot() {
  return EMPTY_CITY;
}

export function useStoredCity() {
  const city = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return city;
}

/** Same value as `useStoredCity()` after hydration — use for `useState` initializer to avoid a flash of empty city. */
export function readClientStoredCity(): string {
  if (typeof window === "undefined") return EMPTY_CITY;
  try {
    return localStorage.getItem(CITY_KEY) ?? EMPTY_CITY;
  } catch {
    return EMPTY_CITY;
  }
}

/** Same value as `useStoredCityRadiusKm()` on client — for `useState` initializer. */
export function readClientStoredRadiusKm(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = (localStorage.getItem(CITY_RADIUS_KM_KEY) ?? "").trim();
    const n = raw ? Number(raw) : 0;
    return clampRadiusKm(n);
  } catch {
    return 0;
  }
}

/** Режим выбора локации для фильтра на главной / в каталоге. */
export type StoredLocationPickKind = "" | "whole" | "settlement" | "region" | "district" | "point";

const SERVER_EMPTY_PICK_KIND: StoredLocationPickKind = "";

function getPickKindServerSnapshot(): StoredLocationPickKind {
  return SERVER_EMPTY_PICK_KIND;
}

function normalizeStoredPickKind(raw: string): StoredLocationPickKind {
  const t = (raw ?? "").trim();
  if (t === "whole" || t === "settlement" || t === "region" || t === "district" || t === "point") return t;
  return "";
}

export function setStoredCity(next: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CITY_KEY, next);
  if (!(next ?? "").trim()) {
    localStorage.removeItem(CITY_DISPLAY_NAME_KEY);
  }
  // storage event doesn't fire in same tab; notify subscribers.
  emit();
}

function districtSnapshot(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(CITY_DISTRICT_KEY) ?? "").trim();
}

export function useStoredLocationDistrict(): string {
  return useSyncExternalStore(subscribe, districtSnapshot, getServerSnapshotEmptyString);
}

export function setStoredLocationDistrict(next: string | null | undefined) {
  if (typeof window === "undefined") return;
  const v = (next ?? "").trim();
  if (!v) localStorage.removeItem(CITY_DISTRICT_KEY);
  else localStorage.setItem(CITY_DISTRICT_KEY, v);
  emit();
}

function pickKindSnapshot(): StoredLocationPickKind {
  if (typeof window === "undefined") return "";
  const raw = (localStorage.getItem(CITY_PICK_KIND_KEY) ?? "").trim();
  return normalizeStoredPickKind(raw);
}

export function useStoredLocationPickKind(): StoredLocationPickKind {
  return useSyncExternalStore(subscribe, pickKindSnapshot, getPickKindServerSnapshot);
}

/** Возвращает `""` когда ключ ещё не писался (до обновления). */
export function readClientStoredPickKind(): StoredLocationPickKind {
  if (typeof window === "undefined") return "";
  try {
    return normalizeStoredPickKind(localStorage.getItem(CITY_PICK_KIND_KEY) ?? "");
  } catch {
    return "";
  }
}

export function readClientStoredDistrict(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(CITY_DISTRICT_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function setStoredLocationPickKind(next: StoredLocationPickKind) {
  if (typeof window === "undefined") return;
  const k = normalizeStoredPickKind(`${next}`);
  if (!k.trim()) localStorage.removeItem(CITY_PICK_KIND_KEY);
  else localStorage.setItem(CITY_PICK_KIND_KEY, k);
  emit();
}

function getDisplayNameSnapshot(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(CITY_DISPLAY_NAME_KEY) ?? "").trim();
}

export function useStoredCityDisplayName(): string {
  return useSyncExternalStore(subscribe, getDisplayNameSnapshot, getServerSnapshotEmptyString);
}

export function setStoredCityDisplayName(next: string | null | undefined) {
  if (typeof window === "undefined") return;
  const v = (next ?? "").trim();
  if (!v) localStorage.removeItem(CITY_DISPLAY_NAME_KEY);
  else localStorage.setItem(CITY_DISPLAY_NAME_KEY, v);
  emit();
}

export function readClientStoredCityDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(CITY_DISPLAY_NAME_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function clampRadiusKm(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  const capped = Math.min(250, Math.round(v));
  const snaps = [1, 3, 5, 10, 25, 50, 100, 250];
  let best = snaps[0]!;
  let bestD = Math.abs(capped - best);
  for (const x of snaps) {
    const d = Math.abs(capped - x);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

function getRadiusSnapshot(): number {
  if (typeof window === "undefined") return 0;
  const raw = (localStorage.getItem(CITY_RADIUS_KM_KEY) ?? "").trim();
  const n = raw ? Number(raw) : 0;
  return clampRadiusKm(n);
}

function getRadiusServerSnapshot(): number {
  return SERVER_ZERO;
}

export function useStoredCityRadiusKm() {
  return useSyncExternalStore(subscribe, getRadiusSnapshot, getRadiusServerSnapshot);
}

export function setStoredCityRadiusKm(nextKm: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CITY_RADIUS_KM_KEY, String(clampRadiusKm(nextKm)));
  emit();
}

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = (localStorage.getItem(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getStoredCityLatSnapshot(): number | null {
  return readNumber(CITY_LAT_KEY);
}

function getStoredCityLngSnapshot(): number | null {
  return readNumber(CITY_LNG_KEY);
}

export function useStoredCityCoords(): { lat: number | null; lng: number | null } {
  const lat = useSyncExternalStore(subscribe, getStoredCityLatSnapshot, getServerSnapshotNullNumber);
  const lng = useSyncExternalStore(subscribe, getStoredCityLngSnapshot, getServerSnapshotNullNumber);
  return { lat, lng };
}

export function setStoredCityCoords(next: { lat?: number | null; lng?: number | null }) {
  if (typeof window === "undefined") return;
  const lat = typeof next.lat === "number" && Number.isFinite(next.lat) ? next.lat : null;
  const lng = typeof next.lng === "number" && Number.isFinite(next.lng) ? next.lng : null;
  if (lat == null) localStorage.removeItem(CITY_LAT_KEY);
  else localStorage.setItem(CITY_LAT_KEY, String(lat));
  if (lng == null) localStorage.removeItem(CITY_LNG_KEY);
  else localStorage.setItem(CITY_LNG_KEY, String(lng));
  emit();
}

function getRegionSnapshot(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(CITY_REGION_KEY) ?? "").trim();
}

export function useStoredCityRegion(): string {
  return useSyncExternalStore(subscribe, getRegionSnapshot, getServerSnapshotEmptyString);
}

export function setStoredCityRegion(region: string | null | undefined) {
  if (typeof window === "undefined") return;
  const v = (region ?? "").trim();
  if (!v) localStorage.removeItem(CITY_REGION_KEY);
  else localStorage.setItem(CITY_REGION_KEY, v);
  emit();
}

export type StoredCitySource = "manual" | "auto" | "";

const SERVER_STORED_SOURCE_EMPTY: StoredCitySource = "";

function getServerSnapshotStoredSourceEmpty(): StoredCitySource {
  return SERVER_STORED_SOURCE_EMPTY;
}

function getSourceSnapshot(): StoredCitySource {
  if (typeof window === "undefined") return SERVER_STORED_SOURCE_EMPTY;
  const raw = (localStorage.getItem(CITY_SOURCE_KEY) ?? "").trim();
  if (raw === "manual" || raw === "auto") return raw;
  return SERVER_STORED_SOURCE_EMPTY;
}

export function useStoredCitySource(): StoredCitySource {
  return useSyncExternalStore(subscribe, getSourceSnapshot, getServerSnapshotStoredSourceEmpty);
}

export function readClientStoredCitySource(): StoredCitySource {
  if (typeof window === "undefined") return "";
  try {
    const raw = (localStorage.getItem(CITY_SOURCE_KEY) ?? "").trim();
    if (raw === "manual" || raw === "auto") return raw;
    return "";
  } catch {
    return "";
  }
}

export function setStoredCitySource(next: StoredCitySource) {
  if (typeof window === "undefined") return;
  const v = (next ?? "").trim();
  if (v !== "manual" && v !== "auto") {
    localStorage.removeItem(CITY_SOURCE_KEY);
    localStorage.removeItem(CITY_AUTO_TS_KEY);
  } else {
    localStorage.setItem(CITY_SOURCE_KEY, v);
    if (v === "auto") localStorage.setItem(CITY_AUTO_TS_KEY, String(Date.now()));
    else localStorage.removeItem(CITY_AUTO_TS_KEY);
  }
  emit();
}

/** Clear only auto-detected city/coords/region (never manual selection). */
export function clearStoredAutoCity() {
  if (typeof window === "undefined") return;
  const src = getSourceSnapshot();
  if (src !== "auto") return;
  localStorage.removeItem(CITY_KEY);
  localStorage.removeItem(CITY_DISPLAY_NAME_KEY);
  localStorage.removeItem(CITY_REGION_KEY);
  localStorage.removeItem(CITY_DISTRICT_KEY);
  localStorage.removeItem(CITY_PICK_KIND_KEY);
  localStorage.removeItem(CITY_LAT_KEY);
  localStorage.removeItem(CITY_LNG_KEY);
  localStorage.removeItem(CITY_SEARCH_SCOPE_KEY);
  localStorage.removeItem(CITY_SOURCE_KEY);
  localStorage.removeItem(CITY_AUTO_TS_KEY);
  emit();
}

function readAutoTs(): number | null {
  if (typeof window === "undefined") return null;
  const raw = (localStorage.getItem(CITY_AUTO_TS_KEY) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function looksLikeAdministrativeAreaLabel(name: string): boolean {
  const n = (name || "").trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes("район") ||
    n.includes("сельсовет") ||
    n.includes("с/с") ||
    n.includes("область") ||
    n.includes("край") ||
    n.includes("республика") ||
    n.includes("округ")
  );
}

/** Clean stale/invalid auto-detected city (never manual). */
export function cleanupStoredAutoCityOnLoad() {
  if (typeof window === "undefined") return;
  const src = getSourceSnapshot();
  if (src !== "auto") return;

  const ts = readAutoTs();
  const tooOld = ts != null && Date.now() - ts > 10 * 60 * 1000;
  const city = (localStorage.getItem(CITY_KEY) ?? "").trim();
  const lat = readNumber(CITY_LAT_KEY);
  const lng = readNumber(CITY_LNG_KEY);
  const coordsOk =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat + lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const badCity = !city || looksLikeAdministrativeAreaLabel(city) || looksLikeRuralAutoSettlement(city);

  if (tooOld || !coordsOk || badCity) {
    clearStoredAutoCity();
  }
}

function readLegacyLocationSnapshotFromStorage(): LegacyLocationSnapshot {
  if (typeof window === "undefined") {
    return {
      city: "",
      region: "",
      district: "",
      displayName: "",
      pickKind: "",
      lat: null,
      lng: null,
      radiusKm: 0,
    };
  }
  const rawR = (localStorage.getItem(CITY_RADIUS_KM_KEY) ?? "").trim();
  const rk = rawR ? Number(rawR) : 0;

  return {
    city: (localStorage.getItem(CITY_KEY) ?? "").trim(),
    region: (localStorage.getItem(CITY_REGION_KEY) ?? "").trim(),
    district: (localStorage.getItem(CITY_DISTRICT_KEY) ?? "").trim(),
    displayName: (localStorage.getItem(CITY_DISPLAY_NAME_KEY) ?? "").trim(),
    pickKind: normalizeStoredPickKind(localStorage.getItem(CITY_PICK_KIND_KEY) ?? ""),
    lat: readNumber(CITY_LAT_KEY),
    lng: readNumber(CITY_LNG_KEY),
    radiusKm: clampRadiusKm(rk),
  };
}

function parseSearchScopeJson(raw: string | null): SearchScopeLocation | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as SearchScopeLocation;
    if (!j || typeof j !== "object") return null;
    if (typeof j.type !== "string" || typeof j.label !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

/** All keys that affect `readClientSearchScope()` — for stable `useSyncExternalStore` snapshots. */
const SEARCH_SCOPE_SNAPSHOT_FINGERPRINT_KEYS = [
  CITY_SEARCH_SCOPE_KEY,
  CITY_KEY,
  CITY_DISPLAY_NAME_KEY,
  CITY_RADIUS_KM_KEY,
  CITY_LAT_KEY,
  CITY_LNG_KEY,
  CITY_REGION_KEY,
  CITY_DISTRICT_KEY,
  CITY_PICK_KIND_KEY,
] as const;

function getSearchScopeStorageFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    let acc = "";
    for (const k of SEARCH_SCOPE_SNAPSHOT_FINGERPRINT_KEYS) {
      acc += "\u0001" + (localStorage.getItem(k) ?? "");
    }
    return acc;
  } catch {
    return "";
  }
}

let searchScopeSnapshotFingerprint = "";
let searchScopeSnapshotCached: SearchScopeLocation = DEFAULT_SEARCH_SCOPE;

export function readClientSearchScope(): SearchScopeLocation {
  if (typeof window === "undefined") return DEFAULT_SEARCH_SCOPE;
  const fromJson = parseSearchScopeJson(localStorage.getItem(CITY_SEARCH_SCOPE_KEY));
  if (fromJson) return normalizeSearchScope(fromJson);
  return searchScopeFromLegacySnapshot(readLegacyLocationSnapshotFromStorage());
}

export function setStoredSearchScope(next: SearchScopeLocation) {
  if (typeof window === "undefined") return;
  const norm = normalizeSearchScope(next);

  try {
    localStorage.setItem(CITY_SEARCH_SCOPE_KEY, JSON.stringify(norm));
  } catch {
    /* ignore quota / privacy mode */
  }

  const L = legacyFieldsFromSearchScope(norm);
  const c = L.city.trim();
  const dn = L.displayName.trim();
  const reg = L.region.trim();
  const dist = L.district.trim();
  const pk = `${L.pickKind}`.trim();

  if (!c) localStorage.removeItem(CITY_KEY);
  else localStorage.setItem(CITY_KEY, c);

  if (!dn) localStorage.removeItem(CITY_DISPLAY_NAME_KEY);
  else localStorage.setItem(CITY_DISPLAY_NAME_KEY, dn);

  if (!reg) localStorage.removeItem(CITY_REGION_KEY);
  else localStorage.setItem(CITY_REGION_KEY, reg);

  if (!dist) localStorage.removeItem(CITY_DISTRICT_KEY);
  else localStorage.setItem(CITY_DISTRICT_KEY, dist);

  if (!pk) localStorage.removeItem(CITY_PICK_KIND_KEY);
  else localStorage.setItem(CITY_PICK_KIND_KEY, pk);

  localStorage.setItem(CITY_RADIUS_KM_KEY, String(clampRadiusKm(L.radiusKm)));

  if (typeof L.lat === "number" && Number.isFinite(L.lat)) {
    localStorage.setItem(CITY_LAT_KEY, String(L.lat));
  } else {
    localStorage.removeItem(CITY_LAT_KEY);
  }
  if (typeof L.lng === "number" && Number.isFinite(L.lng)) {
    localStorage.setItem(CITY_LNG_KEY, String(L.lng));
  } else {
    localStorage.removeItem(CITY_LNG_KEY);
  }

  emit();
}

function getSearchScopeSnapshot(): SearchScopeLocation {
  if (typeof window === "undefined") return DEFAULT_SEARCH_SCOPE;
  const fp = getSearchScopeStorageFingerprint();
  if (fp === searchScopeSnapshotFingerprint) return searchScopeSnapshotCached;
  searchScopeSnapshotFingerprint = fp;
  const computed = readClientSearchScope();
  /** `normalizeSearchScope` allocates new objects — reuse canonical ref for «вся страна». */
  searchScopeSnapshotCached = computed.type === "country" ? DEFAULT_SEARCH_SCOPE : computed;
  return searchScopeSnapshotCached;
}

/** Канонический фильтр «где ищем» для главной и каталога. */
export function useSearchScope() {
  return useSyncExternalStore(subscribe, getSearchScopeSnapshot, () => DEFAULT_SEARCH_SCOPE);
}

