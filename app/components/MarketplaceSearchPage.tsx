"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatSearchCorrectionDisplay } from "../lib/globalSearchNormalize";
import {
  marketplacePrimaryQueryText,
  marketplaceSearchCorrectionHint,
} from "../lib/marketplaceSearchPrepare";
import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { filterRealMarketplaceCards } from "../lib/marketplaceCardQuality";
import type { MarketplaceProviderId } from "../lib/externalMarketplaceProviders";
import {
  MARKETPLACE_REGION_GROUPS,
  isRealCardsMarketplaceAdapter,
  sanitizeSelectedProviderIds,
  type MarketplaceProviderSearchAction,
} from "../lib/marketplaceProviderGateway";
import {
  parseProvidersUrlParam,
  readSelectedProviderIds,
  writeSelectedProviderIds,
} from "../lib/marketplaceSelectionStorage";
import { buildProviderSearchActions } from "../lib/marketplacePageSearch";
import { MarketplaceLinkOnlyActions } from "./MarketplaceLinkOnlyActions";
import { MarketplacePreviewSection } from "./MarketplacePreviewSection";
import { MarketplaceProviderFilters } from "./MarketplaceProviderFilters";
import { RecentSearchesDropdown } from "./RecentSearchesDropdown";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";
import { pushRecentSearch, RECENT_SEARCH_MIN_LENGTH } from "../lib/recentSearches";

type PageApiResponse = {
  ok?: boolean;
  items?: MarketplaceDisplayCard[];
  actions?: MarketplaceProviderSearchAction[];
  selectedProviders?: MarketplaceProviderId[];
  normalizedQuery?: string;
};

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
      <path d="M20 20 16.5 16.5" />
    </svg>
  );
}

function MarketplaceDiscoverStrip() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
      {MARKETPLACE_REGION_GROUPS.map((group) => (
        <div
          key={group.id}
          className="rounded-xl border border-black/[0.05] bg-white/80 px-3 py-2.5 text-center shadow-sm backdrop-blur-sm"
        >
          <p className="text-xs font-semibold text-black/70 sm:text-sm">{group.title}</p>
          <p className="mt-1 text-[10px] leading-tight text-black/40 sm:text-[11px]">
            {group.providers.length} площадок
          </p>
        </div>
      ))}
    </div>
  );
}

function initialSelectedFromUrl(searchParams: URLSearchParams): MarketplaceProviderId[] {
  const fromUrl = parseProvidersUrlParam(searchParams.get("providers"));
  if (fromUrl?.length) return sanitizeSelectedProviderIds(fromUrl);
  return sanitizeSelectedProviderIds(readSelectedProviderIds());
}

export function MarketplaceSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = (searchParams.get("q") ?? "").trim();

  const [query, setQuery] = useState(initialQ);
  const [submittedQuery, setSubmittedQuery] = useState(initialQ);
  const [selectedProviders, setSelectedProviders] = useState<MarketplaceProviderId[]>(() =>
    initialSelectedFromUrl(searchParams),
  );
  const [items, setItems] = useState<MarketplaceDisplayCard[]>([]);
  const [actions, setActions] = useState<MarketplaceProviderSearchAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(initialQ.length >= 2);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const fetchGen = useRef(0);
  const didInitialSearch = useRef(false);

  const realCardsSelected = useMemo(
    () => selectedProviders.filter(isRealCardsMarketplaceAdapter),
    [selectedProviders],
  );

  const correctionRaw = useMemo(() => marketplaceSearchCorrectionHint(query), [query]);
  const correctionDisplay = correctionRaw ? formatSearchCorrectionDisplay(correctionRaw) : null;

  const syncUrl = useCallback(
    (q: string, providers: readonly MarketplaceProviderId[]) => {
      const p = new URLSearchParams();
      const trimmed = q.trim();
      if (trimmed.length >= 2) p.set("q", trimmed);
      if (providers.length > 0) p.set("providers", providers.join(","));
      const qs = p.toString();
      router.replace(qs ? `/marketplaces?${qs}` : "/marketplaces", { scroll: false });
    },
    [router],
  );

  const handleSelectedChange = useCallback(
    (ids: MarketplaceProviderId[]) => {
      const sanitized = sanitizeSelectedProviderIds(ids);
      setSelectedProviders(sanitized);
      writeSelectedProviderIds(sanitized);
      syncUrl(submittedQuery, sanitized);
    },
    [submittedQuery, syncUrl],
  );

  const runSearch = useCallback(
    async (q: string, providers: readonly MarketplaceProviderId[]) => {
      const trimmed = q.trim();
      if (trimmed.length < 2 || providers.length === 0) {
        setItems([]);
        setActions([]);
        setSearched(false);
        return;
      }

      const gen = ++fetchGen.current;
      setLoading(true);
      setSearched(true);
      setSubmittedQuery(trimmed);
      setActions(buildProviderSearchActions(providers, trimmed));
      try {
        const params = new URLSearchParams({
          q: trimmed,
          providers: providers.join(","),
        });
        const r = await fetch(`/api/marketplaces/search?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await r.json()) as PageApiResponse;
        if (gen !== fetchGen.current) return;
        const raw = data.items ?? [];
        const real = filterRealMarketplaceCards(raw, trimmed) as MarketplaceDisplayCard[];
        setItems(real);
        const fromApi = data.actions ?? [];
        setActions(
          fromApi.length > 0 ? fromApi : buildProviderSearchActions(providers, trimmed),
        );
      } catch {
        if (gen !== fetchGen.current) return;
        setItems([]);
        setActions(buildProviderSearchActions(providers, trimmed));
      } finally {
        if (gen === fetchGen.current) setLoading(false);
      }
    },
    [],
  );

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= RECENT_SEARCH_MIN_LENGTH) {
      pushRecentSearch(trimmed);
    }
    syncUrl(query, selectedProviders);
    void runSearch(query, selectedProviders);
    setMobileFiltersOpen(false);
    setSearchFocused(false);
  }, [query, selectedProviders, syncUrl, runSearch]);

  const applyRecentMarketplaceSearch = useCallback(
    (recentQuery: string) => {
      const trimmed = recentQuery.trim();
      if (trimmed.length < 2) return;
      setQuery(trimmed);
      setSearchFocused(false);
      syncUrl(trimmed, selectedProviders);
      void runSearch(trimmed, selectedProviders);
      setMobileFiltersOpen(false);
    },
    [selectedProviders, syncUrl, runSearch],
  );

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const node = e.target;
      if (!(node instanceof Node)) return;
      if (searchWrapRef.current?.contains(node)) return;
      setSearchFocused(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, false);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, false);
  }, []);

  useEffect(() => {
    if (didInitialSearch.current) return;
    if (initialQ.length < 2) return;
    didInitialSearch.current = true;
    void runSearch(initialQ, selectedProviders);
  }, [initialQ, selectedProviders, runSearch]);

  const displayQuery = useMemo(
    () =>
      submittedQuery.trim().length >= 2 ? marketplacePrimaryQueryText(submittedQuery) : "",
    [submittedQuery],
  );

  const queryTrim = query.trim();
  const canSearch = queryTrim.length >= 2 && selectedProviders.length > 0;
  const showRecentDropdown = searchFocused && queryTrim.length === 0;
  const showPreviewSection =
    searched && realCardsSelected.length > 0 && (loading || items.length > 0);
  const showProviderGateway = searched && displayQuery.length >= 2 && actions.length > 0;

  const filterPanel = (
    <MarketplaceProviderFilters
      selectedIds={selectedProviders}
      onSelectedChange={handleSelectedChange}
    />
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-5 sm:pb-12 sm:pt-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-4xl">
            Поиск по маркетплейсам
          </h1>
          <p className="mt-2 text-sm text-black/55 sm:mt-3 sm:text-base">
            Один запрос — поиск по площадкам по всему миру
          </p>

          <div className="sticky top-[3.25rem] z-20 mt-5 sm:top-[4.5rem] sm:mt-7">
            <div className="rounded-2xl border border-black/[0.08] bg-white p-1 shadow-[0_4px_20px_rgba(255,122,0,0.08)] ring-1 ring-black/[0.04]">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
                <div ref={searchWrapRef} className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/30" />
                  <input
                    id="marketplace-page-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSearch) {
                        e.preventDefault();
                        submitSearch();
                      }
                    }}
                    placeholder="iPhone, кроссовки, инструмент…"
                    autoComplete="off"
                    className="h-11 w-full rounded-xl bg-transparent pl-10 pr-3 text-sm text-black outline-none placeholder:text-black/35 sm:h-12 sm:text-[15px]"
                  />
                  {showRecentDropdown ?
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[200]">
                      <RecentSearchesDropdown open onPick={applyRecentMarketplaceSearch} />
                    </div>
                  : null}
                </div>
                <button
                  type="button"
                  disabled={!canSearch || loading}
                  onClick={submitSearch}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#f07000] disabled:cursor-not-allowed disabled:opacity-45 sm:h-12 sm:min-w-[6.5rem]"
                >
                  {loading ? "…" : "Найти"}
                </button>
              </div>
            </div>

            {correctionDisplay ?
              <p className="mt-2 text-center text-sm text-black/50">
                Возможно, вы имели в виду:{" "}
                <button
                  type="button"
                  className="font-semibold text-[#c25a00] hover:underline"
                  onClick={() => {
                    const next = correctionRaw!;
                    setQuery(next);
                    syncUrl(next, selectedProviders);
                    void runSearch(next, selectedProviders);
                  }}
                >
                  {correctionDisplay}
                </button>
              </p>
            : null}
          </div>

          {!searched ?
            <>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {MARKETPLACE_REGION_GROUPS.flatMap((g) => g.providers)
                  .slice(0, 8)
                  .map((p) => {
                    const v = getMarketplaceChipVisual(p.id);
                    return (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-white px-2 py-1 text-[10px] font-medium text-black/55 shadow-sm sm:text-xs"
                      >
                        <span
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-white"
                          style={{ backgroundColor: v.brandColor }}
                          aria-hidden
                        >
                          {v.abbr}
                        </span>
                        {p.name}
                      </span>
                    );
                  })}
              </div>
              <MarketplaceDiscoverStrip />
            </>
          : null}
        </div>

        <div className="mt-6 flex flex-col gap-5 lg:mt-8 lg:flex-row lg:items-start lg:gap-6">
          <aside className="hidden shrink-0 lg:block lg:w-[260px]">
            <div className="sticky top-36 rounded-2xl border border-black/[0.06] bg-white/90 p-3 shadow-sm backdrop-blur-sm">
              {filterPanel}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((o) => !o)}
              className="mb-3 flex w-full items-center justify-between rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 text-sm font-medium text-black/75 shadow-sm lg:hidden"
            >
              <span>Площадки · {selectedProviders.length}</span>
              <span className="text-black/35">{mobileFiltersOpen ? "▲" : "▼"}</span>
            </button>
            {mobileFiltersOpen ?
              <div className="mb-4 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-sm lg:hidden">
                {filterPanel}
              </div>
            : null}

            {searched ?
              <div className="space-y-8 sm:space-y-10">
                {showPreviewSection ?
                  <MarketplacePreviewSection
                    query={displayQuery}
                    items={items}
                    loading={loading}
                  />
                : null}

                {showProviderGateway ?
                  <div className="rounded-2xl border border-black/[0.04] bg-black/[0.015] p-3 sm:p-4">
                    <MarketplaceLinkOnlyActions actions={actions} query={displayQuery} />
                  </div>
                : null}
              </div>
            : selectedProviders.length === 0 ?
              <p className="text-center text-sm text-black/45 lg:text-left">
                Отметьте площадки в фильтре
              </p>
            : null}
          </div>
        </div>
      </div>
    </div>
  );
}
