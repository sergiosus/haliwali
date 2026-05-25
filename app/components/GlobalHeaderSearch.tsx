"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { globalSearchScopeToQueryParams } from "../lib/globalSearchScopeParams";
import type { GlobalSearchSuggestItem } from "../lib/globalSearchTypes";
import { HeroMarketplaceEntry } from "./HeroMarketplaceEntry";
import { MarketplaceSuggestRow } from "./MarketplaceSuggestRow";
import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import {
  bestGlobalSearchQueryText,
  formatSearchCorrectionDisplay,
  globalSearchCorrectionHint,
} from "../lib/globalSearchNormalize";
import { searchDebugLog } from "../lib/searchMatch";
import { getHeaderSuggestExternalSearchLinks } from "../lib/externalSearchLinks";
import { pushRecentSearch, RECENT_SEARCH_MIN_LENGTH } from "../lib/recentSearches";
import { useSearchScope } from "../lib/useStoredCity";
import { RecentSearchesDropdown, useRecentSearches } from "./RecentSearchesDropdown";

const MIN_LISTING_SUGGEST_CHARS = 3;
const MIN_EXTERNAL_SUGGEST_CHARS = 2;
const SUGGEST_DEBOUNCE_MS = 300;
const MARKETPLACE_PREVIEW_DEBOUNCE_MS = 220;
const MAX_LISTING_SUGGESTIONS = 6;
const MAX_MARKETPLACE_PREVIEW = 5;

type ListingTypeOrder = "product" | "service" | "task";

const SECTION_ORDER: ListingTypeOrder[] = ["product", "service", "task"];
const HALIWALI_LISTINGS_LABEL = "Объявления Haliwali";
const MARKETPLACE_SECTION_LABEL = "Товары с маркетплейсов";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function listingTypeShort(listingType: GlobalSearchSuggestItem["listingType"]): string | null {
  if (listingType === "task") return "Задача";
  if (listingType === "service") return "Услуга";
  if (listingType === "product") return "Товар";
  return null;
}

function suggestionSubtitle(s: GlobalSearchSuggestItem): string {
  const cat = (s.categoryLabel ?? "").trim();
  const city = (s.city ?? "").trim();
  if (cat && city) return `${cat} · ${city}`;
  return cat || city;
}

/** Preserve global API order within each type bucket (Товары → Услуги → Задачи). */
function partitionListingSuggestions(items: GlobalSearchSuggestItem[]): {
  buckets: Record<ListingTypeOrder, GlobalSearchSuggestItem[]>;
  flat: GlobalSearchSuggestItem[];
} {
  const buckets: Record<ListingTypeOrder, GlobalSearchSuggestItem[]> = {
    product: [],
    service: [],
    task: [],
  };
  for (const s of items) {
    if (s.kind !== "listing" || !s.listingType) continue;
    const t = s.listingType;
    if (t === "product" || t === "service" || t === "task") buckets[t].push(s);
  }
  const flat: GlobalSearchSuggestItem[] = [];
  for (const k of SECTION_ORDER) flat.push(...buckets[k]);
  return { buckets, flat };
}

export function GlobalHeaderSearch({
  className = "",
  inputClassName,
  iconLeftClassName = "left-3.5 md:left-5",
  variant = "header",
}: {
  className?: string;
  inputClassName?: string;
  iconLeftClassName?: string;
  /** `hero` — primary homepage search; `header` — compact sticky header bar. */
  variant?: "header" | "hero";
}) {
  const isHero = variant === "hero";
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const searchScope = useSearchScope();
  const listId = useId();

  const isHome = pathname === "/" || pathname === "";
  const isSearchPage = pathname === "/search";
  /** Hero search on `/` must always show the unified dropdown (not gated on pathname quirks). */
  const suggestEnabled = isHero || isHome || isSearchPage;

  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<GlobalSearchSuggestItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [submitHint, setSubmitHint] = useState(false);
  const { queries: recentQueries, refresh: refreshRecentQueries } = useRecentSearches();
  const [mpCards, setMpCards] = useState<MarketplaceDisplayCard[]>([]);
  const [mpLoading, setMpLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputFocusedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const mpDebounceRef = useRef<number | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const mpAbortRef = useRef<AbortController | null>(null);
  const suggestSeqRef = useRef(0);
  const mpSeqRef = useRef(0);

  const qFromUrl = (sp.get("q") ?? "").trim();
  useEffect(() => {
    if (isHome || isSearchPage) {
      const fromUrl = qFromUrl;
      queueMicrotask(() => {
        setQ(fromUrl);
        if (!fromUrl.trim()) {
          setSuggestions([]);
          setMpCards([]);
          setSuggestLoading(false);
          setMpLoading(false);
          setActiveIdx(-1);
          if (!inputFocusedRef.current) setSuggestOpen(false);
        }
      });
    } else {
      queueMicrotask(() => setQ(""));
    }
  }, [isHome, isSearchPage, qFromUrl]);

  /** Live URL params (avoids stale useSearchParams when clearing q). */
  const liveSearchParams = useCallback((): URLSearchParams => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(sp.toString());
  }, [sp]);

  const pathWithQuery = useCallback((basePath: string, params: URLSearchParams) => {
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }, []);

  const resetSuggestState = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (mpDebounceRef.current != null) {
      window.clearTimeout(mpDebounceRef.current);
      mpDebounceRef.current = null;
    }
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    mpAbortRef.current?.abort();
    mpAbortRef.current = null;
    suggestSeqRef.current += 1;
    mpSeqRef.current += 1;
    setSuggestions([]);
    setMpCards([]);
    setSuggestLoading(false);
    setMpLoading(false);
    setActiveIdx(-1);
    setSuggestOpen(false);
    setSubmitHint(false);
  }, []);

  const replaceHomeQ = useCallback(
    (raw: string) => {
      if (!isHome) return;
      const next = liveSearchParams();
      next.delete("q");
      const t = raw.trim();
      if (t) next.set("q", t);
      router.replace(pathWithQuery(pathname, next), { scroll: false });
    },
    [isHome, router, liveSearchParams, pathWithQuery, pathname],
  );

  const replaceSearchPageQ = useCallback(
    (raw: string) => {
      if (!isSearchPage) return;
      const next = liveSearchParams();
      next.delete("q");
      const t = raw.trim();
      if (t) next.set("q", t);
      router.replace(pathWithQuery("/search", next), { scroll: false });
    },
    [isSearchPage, router, liveSearchParams, pathWithQuery],
  );

  /** Clear URL query; keep dropdown open when input stays focused (recent searches). */
  const clearUrlQueryKeepRecentPanel = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (mpDebounceRef.current != null) {
      window.clearTimeout(mpDebounceRef.current);
      mpDebounceRef.current = null;
    }
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    mpAbortRef.current?.abort();
    mpAbortRef.current = null;
    suggestSeqRef.current += 1;
    mpSeqRef.current += 1;
    setQ("");
    setSuggestions([]);
    setMpCards([]);
    setSuggestLoading(false);
    setMpLoading(false);
    setActiveIdx(-1);
    setSubmitHint(false);
    if (inputFocusedRef.current) {
      setSuggestOpen(true);
    } else {
      setSuggestOpen(false);
    }
    if (isHome) {
      const next = liveSearchParams();
      next.delete("q");
      router.replace(pathWithQuery(pathname, next), { scroll: false });
    } else if (isSearchPage) {
      const next = liveSearchParams();
      next.delete("q");
      router.replace(pathWithQuery("/search", next), { scroll: false });
    }
    refreshRecentQueries();
  }, [
    isHome,
    isSearchPage,
    router,
    liveSearchParams,
    pathWithQuery,
    pathname,
    refreshRecentQueries,
  ]);

  const clearHomeOrSearchUrlQuery = useCallback(() => {
    clearUrlQueryKeepRecentPanel();
  }, [clearUrlQueryKeepRecentPanel]);

  /** Navigate to /search (global search). */
  const applySearchQueryAndNavigate = useCallback(
    (raw: string) => {
      const t = raw.trim();
      const searchQ = bestGlobalSearchQueryText(raw);
      if (searchQ.length < MIN_LISTING_SUGGEST_CHARS) return;
      setQ(t);
      setSuggestions([]);
      setSuggestLoading(false);
      setActiveIdx(-1);
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      suggestSeqRef.current += 1;
      setSuggestOpen(false);
      pushRecentSearch(searchQ);
      const p = new URLSearchParams({ q: searchQ });
      const scopeP = globalSearchScopeToQueryParams(searchScope);
      for (const [k, v] of scopeP.entries()) p.set(k, v);
      router.push(`/search?${p.toString()}`);
    },
    [router, searchScope],
  );

  const openListingOrSearch = useCallback(
    (s: GlobalSearchSuggestItem) => {
      const href = (s.href ?? "").trim();
      if (href) {
        suggestAbortRef.current?.abort();
        suggestAbortRef.current = null;
        suggestSeqRef.current += 1;
        setSuggestions([]);
        setSuggestLoading(false);
        setActiveIdx(-1);
        setSuggestOpen(false);
        router.push(href);
        return;
      }
      applySearchQueryAndNavigate((s.query || s.label).trim());
    },
    [applySearchQueryAndNavigate, router],
  );

  const applyRecentSearch = useCallback(
    (query: string) => {
      const t = query.trim();
      if (t.length < RECENT_SEARCH_MIN_LENGTH) return;
      setSubmitHint(false);
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      suggestSeqRef.current += 1;
      setSuggestions([]);
      setSuggestLoading(false);
      setActiveIdx(-1);
      setSuggestOpen(false);
      setQ(t);
      applySearchQueryAndNavigate(t);
    },
    [applySearchQueryAndNavigate],
  );

  const fetchSuggestions = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      if (!suggestEnabled || t.length < MIN_LISTING_SUGGEST_CHARS) {
        suggestAbortRef.current?.abort();
        suggestAbortRef.current = null;
        setSuggestions([]);
        setSuggestLoading(false);
        return;
      }

      const seq = ++suggestSeqRef.current;
      suggestAbortRef.current?.abort();
      const ac = new AbortController();
      suggestAbortRef.current = ac;

      if (seq === suggestSeqRef.current) setSuggestions([]);
      setSuggestLoading(true);

      try {
        const p = new URLSearchParams({ q: t });
        const scopeP = globalSearchScopeToQueryParams(searchScope);
        for (const [k, v] of scopeP.entries()) p.set(k, v);
        const r = await fetch(`/api/search/suggest?${p.toString()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        const d = (await r.json()) as { ok?: boolean; suggestions?: GlobalSearchSuggestItem[] };
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        const raw = r.ok && d.ok && Array.isArray(d.suggestions) ? d.suggestions : [];
        const listingOnly = raw.filter((s) => s.kind === "listing").slice(0, MAX_LISTING_SUGGESTIONS);
        setSuggestions(listingOnly);
        searchDebugLog("suggest-header", {
          raw: t,
          listingCount: listingOnly.length,
        });
      } catch (e) {
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        if (seq === suggestSeqRef.current) setSuggestLoading(false);
      }
    },
    [searchScope, suggestEnabled],
  );

  const fetchMarketplacePreview = useCallback(
    async (raw: string) => {
      const searchQ = bestGlobalSearchQueryText(raw);
      if (!suggestEnabled || searchQ.length < MIN_LISTING_SUGGEST_CHARS) {
        mpAbortRef.current?.abort();
        mpAbortRef.current = null;
        setMpCards([]);
        setMpLoading(false);
        return;
      }

      const seq = ++mpSeqRef.current;
      mpAbortRef.current?.abort();
      const ac = new AbortController();
      mpAbortRef.current = ac;

      if (seq === mpSeqRef.current) setMpCards([]);
      setMpLoading(true);

      try {
        const p = new URLSearchParams({
          q: searchQ,
          preview: "1",
          limit: String(MAX_MARKETPLACE_PREVIEW),
        });
        const r = await fetch(`/api/search/marketplaces?${p.toString()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (seq !== mpSeqRef.current || ac.signal.aborted) return;
        const d = (await r.json()) as { ok?: boolean; cards?: MarketplaceDisplayCard[] };
        if (seq !== mpSeqRef.current || ac.signal.aborted) return;
        const cards =
          r.ok && d.ok && Array.isArray(d.cards) ? d.cards.slice(0, MAX_MARKETPLACE_PREVIEW) : [];
        setMpCards(cards);
      } catch (e) {
        if (seq !== mpSeqRef.current || ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setMpCards([]);
      } finally {
        if (seq === mpSeqRef.current) setMpLoading(false);
      }
    },
    [suggestEnabled],
  );

  const qTrim = q.trim();
  const correctionHint = useMemo(() => globalSearchCorrectionHint(q), [q]);
  const correctionDisplay = useMemo(
    () => (correctionHint ? formatSearchCorrectionDisplay(correctionHint) : null),
    [correctionHint],
  );

  const trySubmitSearch = useCallback(() => {
    const t = q.trim();
    if (t.length < MIN_LISTING_SUGGEST_CHARS) {
      setSubmitHint(true);
      if (suggestEnabled) setSuggestOpen(true);
      return;
    }
    setSubmitHint(false);
    applySearchQueryAndNavigate(q);
  }, [q, suggestEnabled, applySearchQueryAndNavigate]);

  function onInputChange(value: string) {
    const t = value.trim();
    setQ(value);
    setActiveIdx(-1);
    if (t.length >= MIN_LISTING_SUGGEST_CHARS) setSubmitHint(false);

    if (t.length === 0) {
      clearUrlQueryKeepRecentPanel();
      return;
    }

    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    suggestSeqRef.current += 1;
    if (isHome) replaceHomeQ(value);
    if (isSearchPage) replaceSearchPageQ(value);

    if (!suggestEnabled) {
      setSuggestOpen(false);
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestOpen(true);
    setSuggestions([]);
    setSuggestLoading(false);

    setMpCards([]);
    setMpLoading(false);
    mpAbortRef.current?.abort();
    mpAbortRef.current = null;
    mpSeqRef.current += 1;

    if (t.length < MIN_LISTING_SUGGEST_CHARS) {
      return;
    }

    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(value);
      debounceRef.current = null;
    }, SUGGEST_DEBOUNCE_MS);

    if (mpDebounceRef.current != null) window.clearTimeout(mpDebounceRef.current);
    mpDebounceRef.current = window.setTimeout(() => {
      void fetchMarketplacePreview(value);
      mpDebounceRef.current = null;
    }, MARKETPLACE_PREVIEW_DEBOUNCE_MS);
  }

  const { flat } = useMemo(() => partitionListingSuggestions(suggestions), [suggestions]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const t = q.trim();
    if (e.key === "ArrowDown" && flat.length > 0) {
      e.preventDefault();
      setSuggestOpen(true);
      setActiveIdx((i) => (i + 1) % flat.length);
      return;
    }
    if (e.key === "ArrowUp" && flat.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? flat.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      if ((isHome || isSearchPage) && (qTrim.length > 0 || qFromUrl.length > 0)) {
        e.preventDefault();
        clearHomeOrSearchUrlQuery();
        return;
      }
      setSuggestOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (t.length < MIN_LISTING_SUGGEST_CHARS) {
      setSubmitHint(true);
      if (suggestEnabled) setSuggestOpen(true);
      return;
    }
    const pick = activeIdx >= 0 && flat[activeIdx] ? flat[activeIdx]! : null;
    if (pick) {
      openListingOrSearch(pick);
      return;
    }
    setSubmitHint(false);
    applySearchQueryAndNavigate(q);
  }

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const node = e.target;
      if (!(node instanceof Node)) return;
      if (wrapRef.current?.contains(node)) return;
      setSuggestOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, false);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (mpDebounceRef.current != null) window.clearTimeout(mpDebounceRef.current);
      suggestAbortRef.current?.abort();
      mpAbortRef.current?.abort();
    };
  }, []);

  const headerInputCls =
    inputClassName ??
    "h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-black outline-none placeholder:text-black/40 focus:border-gray-300 focus:ring-2 focus:ring-[rgba(255,122,0,0.2)]";

  const heroInputCls =
    inputClassName ??
    "min-h-[3.75rem] w-full flex-1 border-0 bg-transparent py-3.5 pl-12 pr-3 text-lg text-black outline-none placeholder:text-black/45 sm:min-h-[4rem] sm:text-xl";

  const headerExternalLinks = useMemo(() => getHeaderSuggestExternalSearchLinks(q), [q]);

  const showShortQueryHint = qTrim.length > 0 && qTrim.length < MIN_LISTING_SUGGEST_CHARS;
  const showExternalBlock =
    headerExternalLinks.length > 0 && qTrim.length >= MIN_EXTERNAL_SUGGEST_CHARS;
  const showCorrectionBlock =
    Boolean(correctionHint) && qTrim.length >= MIN_EXTERNAL_SUGGEST_CHARS;
  const showListingBlock =
    qTrim.length >= MIN_LISTING_SUGGEST_CHARS && (suggestLoading || flat.length > 0);
  const showMarketplaceBlock =
    qTrim.length >= MIN_LISTING_SUGGEST_CHARS && mpCards.length > 0;
  const showRecentBlock = qTrim.length === 0 && recentQueries.length > 0;
  const showSuggestExtras =
    suggestEnabled &&
    (showShortQueryHint ||
      showCorrectionBlock ||
      showListingBlock ||
      showMarketplaceBlock ||
      showExternalBlock);
  const showSuggestPanel = suggestOpen && (showRecentBlock || showSuggestExtras);
  const showSubmitValidation =
    submitHint && qTrim.length > 0 && qTrim.length < MIN_LISTING_SUGGEST_CHARS;

  const openSuggestOnFocus = useCallback(() => {
    inputFocusedRef.current = true;
    refreshRecentQueries();
    setSuggestOpen(true);
    const t = q.trim();
    if (!suggestEnabled) return;
    if (t.length >= MIN_LISTING_SUGGEST_CHARS && suggestions.length === 0 && !suggestLoading) {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void fetchSuggestions(q);
        debounceRef.current = null;
      }, SUGGEST_DEBOUNCE_MS);
      if (mpDebounceRef.current != null) window.clearTimeout(mpDebounceRef.current);
      mpDebounceRef.current = window.setTimeout(() => {
        void fetchMarketplacePreview(q);
        mpDebounceRef.current = null;
      }, MARKETPLACE_PREVIEW_DEBOUNCE_MS);
    }
  }, [
    suggestEnabled,
    q,
    refreshRecentQueries,
    suggestions.length,
    suggestLoading,
    fetchSuggestions,
    fetchMarketplacePreview,
  ]);

  const suggestPanelShellCls = `flex max-h-[min(62vh,22rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 sm:max-h-[min(50vh,20rem)] ${
    isHero ? "shadow-xl" : ""
  }`;

  const suggestPanelInner = showSuggestPanel ? (
    <>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            onMouseDown={(e) => e.preventDefault()}
          >
            {showRecentBlock ?
              <RecentSearchesDropdown
                open
                onPick={applyRecentSearch}
                className="border-0 shadow-none ring-0"
              />
            : null}

            {showShortQueryHint ?
              <div className="px-3 py-2 text-sm text-black/55">Введите минимум 3 символа для поиска</div>
            : showRecentBlock && qTrim.length === 0 ?
              <div className="px-3 pb-2 text-xs text-black/45">Выберите недавний запрос или начните вводить</div>
            : null}

            {showCorrectionBlock ?
              <div className="border-b border-gray-100 px-3 py-2 text-sm text-black/55">
                Возможно, вы имели в виду:{" "}
                <span className="font-medium text-black/80">{correctionDisplay}</span>
              </div>
            : null}

            {showListingBlock ?
              <div role="listbox" aria-label={HALIWALI_LISTINGS_LABEL}>
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-black/40">
                  {HALIWALI_LISTINGS_LABEL}
                </div>
                {suggestLoading && flat.length === 0 ?
                  <div className="px-3 py-2 text-sm text-black/50">Ищем…</div>
                : null}
                {flat.map((s, j) => {
                  const idx = flat.indexOf(s);
                  const typeLine = listingTypeShort(s.listingType);
                  const sub = suggestionSubtitle(s);
                  const key = s.listingId ? `listing:${s.listingId}` : `${s.query}-${j}`;
                  return (
                    <div key={key} role="option" aria-selected={idx === activeIdx}>
                      <button
                        type="button"
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-orange-50 ${
                          idx === activeIdx ? "bg-orange-50" : ""
                        }`}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          openListingOrSearch(s);
                        }}
                      >
                        <span className="line-clamp-2 font-medium text-black/90">{s.label}</span>
                        {typeLine ?
                          <span className="text-[11px] font-medium text-black/45">{typeLine}</span>
                        : null}
                        {sub ?
                          <span className="line-clamp-1 text-[11px] text-black/40">{sub}</span>
                        : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            : null}

            {showMarketplaceBlock ?
              <div aria-label={MARKETPLACE_SECTION_LABEL}>
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-black/40">
                  {MARKETPLACE_SECTION_LABEL}
                </div>
                {mpLoading && mpCards.length === 0 ?
                  <div className="px-3 py-2 text-sm text-black/50">Загружаем площадки…</div>
                : null}
                {mpCards.map((card, idx) => (
                  <MarketplaceSuggestRow key={`${card.providerId}-${card.externalUrl}-${idx}`} card={card} />
                ))}
              </div>
            : null}

            {showExternalBlock ?
              <div className="border-t border-gray-100 px-3 py-2">
                <ul className="flex flex-col gap-0.5">
                  {headerExternalLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="relative z-[1] block cursor-pointer rounded-md px-1 py-1.5 text-sm text-black/85 underline-offset-2 hover:bg-orange-50 hover:text-black hover:underline"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.setTimeout(() => setSuggestOpen(false), 0);
                        }}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            : null}
          </div>
    </>
  ) : null;

  const suggestPanel =
    suggestPanelInner ?
      <div
        id={listId}
        role="listbox"
        className={`absolute left-0 right-0 top-[calc(100%+6px)] z-[200] ${suggestPanelShellCls}`}
      >
        {suggestPanelInner}
      </div>
    : null;

  if (isHero) {
    return (
      <div ref={wrapRef} className={`relative w-full ${className}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
          <div className="order-1 flex w-full shrink-0 justify-center sm:order-none sm:w-auto sm:justify-start sm:self-center">
            <HeroMarketplaceEntry />
          </div>
          <div className="relative order-2 flex-1 min-w-0 max-w-[860px] sm:order-none">
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] transition-shadow focus-within:border-[rgba(255,122,0,0.35)] focus-within:shadow-[0_12px_40px_rgba(255,122,0,0.12)] focus-within:ring-2 focus-within:ring-[rgba(255,122,0,0.22)]">
              <div className="flex flex-col sm:flex-row sm:items-stretch">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => onInputChange(e.target.value)}
                    onInput={(e) => onInputChange(e.currentTarget.value)}
                    onKeyDown={onKeyDown}
                    onFocus={openSuggestOnFocus}
                    onBlur={() => {
                      inputFocusedRef.current = false;
                    }}
                    placeholder="Что вы ищете? Услуги, товары, задачи…"
                    className={heroInputCls}
                    role="combobox"
                    aria-expanded={showSuggestPanel}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-invalid={showSubmitValidation}
                  />
                </div>
                <button
                  type="button"
                  onClick={trySubmitSearch}
                  className="flex h-14 min-h-[3.75rem] w-full shrink-0 items-center justify-center border-t border-black/[0.08] bg-[#ff7a00] px-6 text-base font-semibold text-white transition-colors hover:bg-[#f07000] active:bg-[#e56800] sm:h-auto sm:w-auto sm:min-w-[8rem] sm:border-l sm:border-t-0"
                >
                  Найти
                </button>
              </div>
            </div>
            {suggestPanel}
          </div>
        </div>
        {showSubmitValidation ?
          <p className="mt-2 text-center text-sm text-[#c2410c]" role="status">
            Введите минимум 3 символа
          </p>
        : null}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`}>
      <SearchIcon
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconLeftClassName}`}
      />
      <input
        type="search"
        value={q}
        onChange={(e) => onInputChange(e.target.value)}
        onInput={(e) => onInputChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        onFocus={openSuggestOnFocus}
        onBlur={() => {
          inputFocusedRef.current = false;
        }}
        placeholder="Поиск по объявлениям"
        className={headerInputCls}
        role="combobox"
        aria-expanded={showSuggestPanel}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {suggestPanel}
    </div>
  );
}
