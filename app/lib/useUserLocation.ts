"use client";

import { useSyncExternalStore } from "react";

type UserLocation = {
  city?: string;
  lat?: number;
  lng?: number;
  updatedAt?: number;
};

const KEY = "haliwali_user_location_v1";

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

// useSyncExternalStore requires snapshot stability: do NOT return a new object each call.
let cachedRaw: string | null = null;
let cachedSnapshot: UserLocation | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (typeof window === "undefined") return () => listeners.delete(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function readCached(): UserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    if (!raw) {
      cachedSnapshot = null;
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      cachedSnapshot = null;
      return null;
    }
    cachedSnapshot = parsed as UserLocation;
    return cachedSnapshot;
  } catch {
    cachedRaw = null;
    cachedSnapshot = null;
    return null;
  }
}

function getSnapshot() {
  return readCached();
}

function getServerSnapshot() {
  return null;
}

export function useUserLocation() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setUserLocation(next: UserLocation | null) {
  if (typeof window === "undefined") return;
  if (!next) {
    sessionStorage.removeItem(KEY);
    cachedRaw = null;
    cachedSnapshot = null;
    emit();
    return;
  }
  const snapshot: UserLocation = { ...next, updatedAt: Date.now() };
  const raw = JSON.stringify(snapshot);
  sessionStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cachedSnapshot = snapshot;
  emit();
}

/**
 * Explicit action: user clicks a button. We do NOT auto-track silently.
 * Returns a user-facing error string (ru) on failure.
 */
/** Auto GPS / reverse-geocode / IP lookups removed — callers should open manual location modal. */
export async function detectUserLocation(): Promise<
  | { ok: true; location: { lat: number; lng: number }; city?: string }
  | { ok: false; error: string }
> {
  await Promise.resolve();
  return {
    ok: false,
    error: "Автоопределение временно отключено. Выберите город вручную.",
  };
}

