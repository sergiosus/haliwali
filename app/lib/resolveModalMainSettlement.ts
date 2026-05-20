"use client";

import {
  incomingModalFieldsToScope,
  type IncomingLocationModalFields,
} from "./locationModalSearchScope";
import { readPersistedUserBrowseScope } from "./browseLocationScope";
import { detectNearestCityScopeFromBrowser, type SnappedSettlement } from "./geoSettlementDetection";
import { findStaticRussiaCityCoords } from "./staticRussiaCities";
import { normalizeSearchScope, type SearchScopeLocation } from "./searchScopeLocation";
import { readClientStoredCity, readStoredScopeFromLegacyFlatKeysOnly } from "./useStoredCity";

export type ModalMainSettlement = {
  name: string;
  region: string;
  lat: number;
  lng: number;
};

const CITY_REGION_KEY = "haliwali_city_region";

function fromSnapped(s: SnappedSettlement): ModalMainSettlement {
  return {
    name: s.name.trim(),
    region: (s.region ?? "").trim(),
    lat: s.lat,
    lng: s.lng,
  };
}

function fromScope(scope: SearchScopeLocation): ModalMainSettlement | null {
  const norm = normalizeSearchScope(scope);
  if (norm.type !== "city" && norm.type !== "settlement") return null;
  const name = (norm.label ?? "").trim();
  if (!name) return null;
  const la = norm.lat;
  const lo = norm.lng;
  if (typeof la !== "number" || typeof lo !== "number" || !Number.isFinite(la + lo)) {
    const region = (norm.region ?? norm.parentName ?? "").trim();
    const sta = findStaticRussiaCityCoords(name, region) ?? findStaticRussiaCityCoords(name, "");
    if (!sta) return null;
    return { name, region, lat: sta.lat, lng: sta.lng };
  }
  return {
    name,
    region: (norm.region ?? norm.parentName ?? "").trim(),
    lat: la,
    lng: lo,
  };
}

function hasCommittedSettlementInValue(v: IncomingLocationModalFields | null | undefined): boolean {
  if (!v) return false;
  const pk = `${v.pickKind ?? ""}`.trim();
  if (pk === "whole") return false;
  const city = `${v.city ?? ""}`.trim();
  const scope = v.scope ? normalizeSearchScope(v.scope) : incomingModalFieldsToScope(v);
  if (scope.type === "country") return false;
  if (scope.type === "city" || scope.type === "settlement") {
    return Boolean((scope.label ?? city).trim());
  }
  return Boolean(city);
}

function settlementFromValue(v: IncomingLocationModalFields | null | undefined): ModalMainSettlement | null {
  if (!hasCommittedSettlementInValue(v)) return null;
  const scope = v?.scope ? normalizeSearchScope(v.scope) : incomingModalFieldsToScope(v);
  return fromScope(scope);
}

function settlementFromStoredBrowseScope(): ModalMainSettlement | null {
  const scope = readPersistedUserBrowseScope();
  if (!scope || scope.type === "country") return null;
  return fromScope(scope);
}

function settlementFromLegacyStoredCoords(): ModalMainSettlement | null {
  if (typeof window === "undefined") return null;
  const scope = readStoredScopeFromLegacyFlatKeysOnly();
  if (scope.type === "country") {
    const city = readClientStoredCity().trim();
    if (!city) return null;
    const region = (localStorage.getItem(CITY_REGION_KEY) ?? "").trim();
    const sta = findStaticRussiaCityCoords(city, region) ?? findStaticRussiaCityCoords(city, "");
    if (sta) return { name: city, region, lat: sta.lat, lng: sta.lng };
    return null;
  }
  return fromScope(scope);
}

export function hasCommittedSettlementInModalValue(
  v: IncomingLocationModalFields | null | undefined,
): boolean {
  return hasCommittedSettlementInValue(v);
}

/**
 * Default main НП for LocationModal: explicit value → saved browse scope → stored city → nearest snapped settlement (not raw GPS).
 */
export async function resolveModalMainSettlement(
  value: IncomingLocationModalFields | null | undefined,
): Promise<ModalMainSettlement | null> {
  const fromValue = settlementFromValue(value);
  if (fromValue) return fromValue;

  const fromBrowse = settlementFromStoredBrowseScope();
  if (fromBrowse) return fromBrowse;

  const fromLegacy = settlementFromLegacyStoredCoords();
  if (fromLegacy) return fromLegacy;

  const scope = await detectNearestCityScopeFromBrowser();
  if (scope) {
    const fromDetected = fromScope(scope);
    if (fromDetected) return fromDetected;
  }

  return null;
}

export function modalMainSettlementToScope(s: ModalMainSettlement): SearchScopeLocation {
  const region = s.region.trim();
  return normalizeSearchScope({
    type: "city",
    label: s.name.trim(),
    region: region || undefined,
    parentName: region || undefined,
    lat: s.lat,
    lng: s.lng,
  });
}
