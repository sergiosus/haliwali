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
  MARKETPLACE_EMPTY_QUERY_HINT,
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
import { MarketplaceProviderFilters } from "./MarketplaceProviderFilters";
import {
  MarketplaceProductCard,
  marketplaceProductGridClassName,
} from "./MarketplaceProductCard";

type PageApiResponse = {
  ok?: boolean;
  items?: MarketplaceDisplayCard[];
  actions?: MarketplaceProviderSearchAction[];
  selectedProviders?: MarketplaceProviderId[];
  normalizedQuery?: string;
};

const SKELETON_COUNT = 4;

function MarketplaceCardSkeleton() {
  return (
    <div className="flex min-h-[280px] animate-pulse flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
      <div className="aspect-[4/3] bg-gradient-to-br from-black/[0.05] to-black/[0.02]" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-3 w-20 rounded-full bg-black/[0.06]" />
        <div className="h-4 w-full rounded-full bg-black/[0.06]" />
        <div className="mt-auto h-10 w-full rounded-xl bg-black/[0.06]" />
      </div>
    </div>
  );
}

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

function MarketplaceRegionOverview() {
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm leading-relaxed text-black/50">{MARKETPLACE_EMPTY_QUERY_HINT}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MARKETPLACE_REGION_GROUPS.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl border border-black/[0.06] bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{group.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-black/55">
              {group.providers.map((p) => p.name).join(" · ")}
            </p>
          </div>
        ))}
      </div>
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
    syncUrl(query, selectedProviders);
    void runSearch(query, selectedProviders);
    setMobileFiltersOpen(false);
  }, [query, selectedProviders, syncUrl, runSearch]);

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

  const canSearch = query.trim().length >= 2 && selectedProviders.length > 0;
  const showProductSkeleton = searched && loading && realCardsSelected.length > 0;
  const showProductCards = searched && !loading && items.length > 0;
  const showProviderGateway = searched && displayQuery.length >= 2 && actions.length > 0;

  const filterPanel = (
    <MarketplaceProviderFilters
      selectedIds={selectedProviders}
      onSelectedChange={handleSelectedChange}
    />
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-orange-50/30 via-white to-white">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 max-w-3xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
            Поиск по маркетплейсам
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-black/50">
            Один запрос — поиск на площадках по всему миру. Откройте каталог на выбранном
            маркетплейсе в один клик.
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <aside className="hidden w-full shrink-0 lg:block lg:w-[300px]">
            <div className="sticky top-20 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
              {filterPanel}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((o) => !o)}
                className="mb-4 flex w-full items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 py-3 text-sm font-medium text-black/80 shadow-sm"
              >
                <span>Страны и площадки ({selectedProviders.length})</span>
                <span className="text-black/40">{mobileFiltersOpen ? "▲" : "▼"}</span>
              </button>
              {mobileFiltersOpen ?
                <div className="mb-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
                  {filterPanel}
                </div>
              : null}
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-white p-1 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35" />
                  <input
                    id="marketplace-page-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSearch) {
                        e.preventDefault();
                        submitSearch();
                      }
                    }}
                    placeholder="Что ищете? Например, iPhone, шины…"
                    autoComplete="off"
                    className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-base text-black outline-none placeholder:text-black/35"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canSearch || loading}
                  onClick={submitSearch}
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[#ff7a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#f07000] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[7.5rem]"
                >
                  {loading ? "Поиск…" : "Найти"}
                </button>
              </div>
            </div>

            {correctionDisplay ?
              <p className="mt-2 text-sm text-black/50">
                Возможно, вы имели в виду:{" "}
                <button
                  type="button"
                  className="font-semibold text-black/80 hover:text-orange-700 hover:underline"
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

            {selectedProviders.length === 0 ?
              <p className="mt-4 text-sm text-black/50">Выберите хотя бы одну площадку слева.</p>
            : null}

            {!searched ? <MarketplaceRegionOverview /> : null}

            {searched ?
              <div className="mt-8 space-y-10">
                {showProductSkeleton ?
                  <section aria-labelledby="marketplace-cards-heading" aria-busy="true">
                    <h2
                      id="marketplace-cards-heading"
                      className="mb-4 text-lg font-semibold text-black"
                    >
                      Карточки товаров
                    </h2>
                    <div className={marketplaceProductGridClassName}>
                      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                        <MarketplaceCardSkeleton key={i} />
                      ))}
                    </div>
                  </section>
                : null}

                {showProductCards ?
                  <section className="space-y-4" aria-labelledby="marketplace-cards-heading">
                    <h2
                      id="marketplace-cards-heading"
                      className="text-lg font-semibold text-black"
                    >
                      Карточки товаров
                    </h2>
                    <div className={marketplaceProductGridClassName}>
                      {items.map((card) => (
                        <MarketplaceProductCard
                          key={`${card.providerId}-${card.externalUrl}`}
                          card={card}
                        />
                      ))}
                    </div>
                  </section>
                : null}

                {showProviderGateway ?
                  <MarketplaceLinkOnlyActions actions={actions} query={displayQuery} />
                : null}
              </div>
            : null}
          </div>
        </div>
      </div>
    </div>
  );
}
