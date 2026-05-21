/** Client-side recent search queries (localStorage). */

import { bestGlobalSearchQueryText } from "./globalSearchNormalize";

export const RECENT_SEARCHES_STORAGE_KEY = "haliwali_recent_searches";
export const RECENT_SEARCHES_CHANGED_EVENT = "haliwali-recent-searches-changed";
export const RECENT_SEARCHES_MAX = 10;
/** Same minimum as listing search submit. */
export const RECENT_SEARCH_MIN_LENGTH = 3;

export function normalizeRecentSearchQuery(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

function recentSearchDedupeKey(raw: string): string {
  return normalizeRecentSearchQuery(raw).toLocaleLowerCase("ru");
}

function dispatchRecentSearchesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_SEARCHES_CHANGED_EVENT));
}

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const q = normalizeRecentSearchQuery(item);
      if (q.length < RECENT_SEARCH_MIN_LENGTH) continue;
      const key = recentSearchDedupeKey(q);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= RECENT_SEARCHES_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Save on explicit search submit only; moves duplicate to top. */
export function pushRecentSearch(raw: string): string[] {
  const q = normalizeRecentSearchQuery(bestGlobalSearchQueryText(raw));
  if (q.length < RECENT_SEARCH_MIN_LENGTH) return readRecentSearches();

  const key = recentSearchDedupeKey(q);
  const prev = readRecentSearches().filter((item) => recentSearchDedupeKey(item) !== key);
  const next = [q, ...prev].slice(0, RECENT_SEARCHES_MAX);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
    dispatchRecentSearchesChanged();
  }

  return next;
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    /* noop */
  }
  dispatchRecentSearchesChanged();
}
