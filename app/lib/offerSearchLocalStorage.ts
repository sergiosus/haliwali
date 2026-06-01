import type { OfferSearchResultItem, OfferSearchStats } from "./catalogOfferAdminSearch";
import type { OfferListingSourceId } from "./catalogSourceOfferTypes";

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "auto_ru"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

const STATE_KEY = "offerSearchState";
const HISTORY_KEY = "offerSearchHistory";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 10;

export type OfferSearchPageSize = 20 | 50 | 100;

export type PersistedOfferSearchState = {
  query: string;
  city: string;
  source: OfferSearchSourceFilter;
  enabledSources?: OfferListingSourceId[];
  priceFrom: string;
  priceTo: string;
  brand: string;
  oem: string;
  page: number;
  perPage: OfferSearchPageSize;
  results: OfferSearchResultItem[];
  skipped: OfferSearchResultItem[];
  selectedIds: string[];
  stats: OfferSearchStats | null;
  message: string | null;
  emptyReason: string | null;
  searched: boolean;
  timestamp: number;
};

function parsePageSize(v: unknown): OfferSearchPageSize {
  const n = Number(v);
  if (n === 50 || n === 100) return n;
  return 20;
}

export function readOfferSearchState(): PersistedOfferSearchState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATE_KEY) ?? localStorage.getItem("offerSearch");
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<PersistedOfferSearchState>;
    const ts = typeof j.timestamp === "number" ? j.timestamp : 0;
    if (!ts || Date.now() - ts > MAX_AGE_MS) {
      localStorage.removeItem(STATE_KEY);
      return null;
    }
    return {
      query: String(j.query ?? ""),
      city: String(j.city ?? ""),
      source: (j.source as OfferSearchSourceFilter) ?? "all",
      enabledSources: Array.isArray(j.enabledSources) ?
        (j.enabledSources as OfferListingSourceId[])
      : undefined,
      priceFrom: String(j.priceFrom ?? ""),
      priceTo: String(j.priceTo ?? ""),
      brand: String(j.brand ?? ""),
      oem: String(j.oem ?? ""),
      page: Math.max(1, Number(j.page) || 1),
      perPage: parsePageSize(j.perPage),
      results: Array.isArray(j.results) ? j.results : [],
      skipped: Array.isArray(j.skipped) ? j.skipped : [],
      selectedIds: Array.isArray(j.selectedIds) ? j.selectedIds.map(String) : [],
      stats: j.stats ?? null,
      message: j.message ?? null,
      emptyReason: j.emptyReason ?? null,
      searched: Boolean(j.searched),
      timestamp: ts,
    };
  } catch {
    return null;
  }
}

export function writeOfferSearchState(state: PersistedOfferSearchState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...state, timestamp: Date.now() }),
    );
  } catch {
    /* quota */
  }
}

export function clearOfferSearchResultsInStorage(): void {
  const current = readOfferSearchState();
  if (!current) return;
  writeOfferSearchState({
    ...current,
    results: [],
    skipped: [],
    selectedIds: [],
    stats: null,
    page: 1,
    searched: false,
    message: null,
    emptyReason: null,
  });
}

export function clearOfferSearchFiltersInStorage(): void {
  const current = readOfferSearchState();
  writeOfferSearchState({
    query: "",
    city: "",
    source: "all",
    priceFrom: "",
    priceTo: "",
    brand: "",
    oem: "",
    page: current?.page ?? 1,
    perPage: current?.perPage ?? 20,
    results: current?.results ?? [],
    skipped: current?.skipped ?? [],
    selectedIds: current?.selectedIds ?? [],
    stats: current?.stats ?? null,
    message: current?.message ?? null,
    emptyReason: current?.emptyReason ?? null,
    searched: current?.searched ?? false,
    timestamp: Date.now(),
  });
}

export function removeOfferSearchState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function readOfferSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeOfferSearchHistory(items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    /* quota */
  }
}

/** Add query to history (newest first, dedupe, max 10). */
export function pushOfferSearchHistory(query: string): string[] {
  const q = query.trim();
  if (q.length < 2) return readOfferSearchHistory();
  const prev = readOfferSearchHistory().filter((h) => h.toLowerCase() !== q.toLowerCase());
  const next = [q, ...prev].slice(0, MAX_HISTORY);
  writeOfferSearchHistory(next);
  return next;
}

export function removeOfferSearchHistoryItem(query: string): string[] {
  const needle = query.trim().toLowerCase();
  const next = readOfferSearchHistory().filter((h) => h.toLowerCase() !== needle);
  writeOfferSearchHistory(next);
  return next;
}

export function clearOfferSearchHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
