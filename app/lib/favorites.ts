"use client";

const KEY = "haliwali_favorites_by_user";
const EVT = "haliwali:favorites-changed";

type FavMap = Record<string, string[]>;

function readMap(): FavMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as FavMap;
  } catch {
    return {};
  }
}

function writeMap(next: FavMap) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}

export function getFavorites(userId: string): string[] {
  if (!userId) return [];
  const m = readMap();
  return m[userId] ?? [];
}

export function isFavorite(userId: string, listingId: string): boolean {
  if (!userId || !listingId) return false;
  return getFavorites(userId).includes(listingId);
}

export function toggleFavorite(userId: string, listingId: string): boolean {
  if (!userId || !listingId) return false;
  const m = readMap();
  const current = m[userId] ?? [];
  const has = current.includes(listingId);
  m[userId] = has ? current.filter((x) => x !== listingId) : [listingId, ...current];
  writeMap(m);
  return !has;
}

export function subscribeFavorites(onChange: () => void) {
  function onStorage(e: StorageEvent) {
    if (e.key === KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVT, onChange);
  };
}

