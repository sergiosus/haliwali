"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CompactListingCard } from "../components/CompactListingCard";
import { ExternalSearchResults } from "../components/ExternalSearchResults";
import { appendReturnUrlQuery } from "../lib/returnNavigation";
import type { ExternalSearchResultItem } from "../lib/externalSearch";
import { getExternalMarketplaceSearchLinks } from "../lib/externalSearchLinks";
import { globalSearchScopeToQueryParams } from "../lib/globalSearchScopeParams";
import type { GlobalSearchListingTypeFilter, GlobalSearchResultItem } from "../lib/globalSearchTypes";
import type { Listing, ListingType } from "../lib/listingModel";
import { homepageLocationLabelFromScope, normalizeSearchScope } from "../lib/searchScopeLocation";
import { useCompactListingEnrichment } from "../lib/useCompactListingEnrichment";
import { normalizeGlobalSearchQuery, searchDebugLog } from "../lib/searchMatch";
import { useSearchScope } from "../lib/useStoredCity";

const TYPE_TABS: { id: GlobalSearchListingTypeFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "task", label: "Задачи" },
  { id: "service", label: "Услуги" },
  { id: "product", label: "Товары" },
];

function resultListingType(t: GlobalSearchResultItem["type"]): ListingType {
  if (t === "task") return "task";
  if (t === "service") return "service";
  return "product_sell";
}

function searchResultToListing(r: GlobalSearchResultItem): Listing {
  const type = resultListingType(r.type);
  const base = {
    id: r.id,
    editToken: "",
    status: "approved" as const,
    moderationReason: "",
    title: r.title,
    description: r.descriptionSnippet,
    categoryName: r.category,
    categorySlug: r.subcategory,
    city: r.city,
    photos: r.imageUrl ? [r.imageUrl] : [],
    createdAt: Date.now(),
    location: r.region ? { city: r.city, region: r.region } : undefined,
  };
  if (type === "service") {
    return { ...base, type: "service", specialization: r.subcategory || r.category } as Listing;
  }
  if (type === "product_sell") {
    return { ...base, type: "product_sell", price: 0 } as Listing;
  }
  return { ...base, type: "task" } as Listing;
}

function matchesListingTypeFilter(
  r: GlobalSearchResultItem,
  filter: GlobalSearchListingTypeFilter,
): boolean {
  if (filter === "all") return true;
  return r.type === filter;
}

export function SearchPageClient() {
  const sp = useSearchParams();
  const query = (sp.get("q") ?? "").trim();
  const typeParam = (sp.get("type") ?? "all").trim().toLowerCase();
  const type: GlobalSearchListingTypeFilter =
    typeParam === "task" || typeParam === "service" || typeParam === "product" ? typeParam : "all";

  const searchScope = useSearchScope();
  const scopeLabel = homepageLocationLabelFromScope(searchScope);
  /** Stable key when `useSearchScope` reuses the same object reference across renders. */
  const searchScopeKey = useMemo(
    () => JSON.stringify(normalizeSearchScope(searchScope)),
    [searchScope],
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResultItem[]>([]);
  const [externalResults, setExternalResults] = useState<ExternalSearchResultItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);

  const displayedResults = useMemo(
    () => results.filter((r) => matchesListingTypeFilter(r, type)),
    [results, type],
  );

  const listings = useMemo(
    () => displayedResults.map(searchResultToListing),
    [displayedResults],
  );
  const { viewCounts, publicByUserId } = useCompactListingEnrichment(listings);

  const returnHref = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (type !== "all") p.set("type", type);
    const scopeP = globalSearchScopeToQueryParams(searchScope);
    for (const [k, v] of scopeP.entries()) p.set(k, v);
    const qs = p.toString();
    return qs ? `/search?${qs}` : "/search";
  }, [query, type, searchScope]);

  useEffect(() => {
    const gen = ++fetchGenerationRef.current;
    setResults([]);
    setExternalResults([]);
    setFetchError(null);

    if (!query) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const fetchQuery = query;
    setLoading(true);

    void (async () => {
      try {
        const p = new URLSearchParams({ q: fetchQuery, type: "all", limit: "60" });
        const scopeP = globalSearchScopeToQueryParams(searchScope);
        for (const [k, v] of scopeP.entries()) p.set(k, v);
        const r = await fetch(`/api/search?${p.toString()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (ac.signal.aborted || gen !== fetchGenerationRef.current) return;
        const d = (await r.json()) as {
          ok?: boolean;
          results?: GlobalSearchResultItem[];
          externalResults?: ExternalSearchResultItem[];
          error?: string;
        };
        if (ac.signal.aborted || gen !== fetchGenerationRef.current) return;
        if (!r.ok || !d.ok) {
          setResults([]);
          setExternalResults([]);
          setFetchError(d.error ?? "search_failed");
          return;
        }
        const list = Array.isArray(d.results) ? d.results : [];
        if (ac.signal.aborted || gen !== fetchGenerationRef.current) return;
        setResults(list);
        setExternalResults(Array.isArray(d.externalResults) ? d.externalResults : []);
        const n = normalizeGlobalSearchQuery(fetchQuery);
        searchDebugLog("search-page", {
          raw: n.original,
          variants: n.normalizedUniqueVariants,
          resultCount: list.length,
        });
      } catch {
        if (ac.signal.aborted || gen !== fetchGenerationRef.current) return;
        setResults([]);
        setExternalResults([]);
        setFetchError("search_failed");
      } finally {
        if (!ac.signal.aborted && gen === fetchGenerationRef.current) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [query, searchScopeKey, searchScope]);

  function typeTabHref(nextType: GlobalSearchListingTypeFilter) {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (nextType !== "all") p.set("type", nextType);
    const scopeP = globalSearchScopeToQueryParams(searchScope);
    for (const [k, v] of scopeP.entries()) p.set(k, v);
    const qs = p.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  const marketplaceLinks = useMemo(
    () => getExternalMarketplaceSearchLinks(query, type),
    [query, type],
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-3 py-6 sm:px-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black">Результаты поиска</h1>
          {query ?
            <>
              <p className="mt-1 text-sm text-black/70">По запросу: «{query}»</p>
              <p className="mt-0.5 text-sm text-black/60">
                {loading ? "Ищем…" : `Найдено: ${displayedResults.length}`}
                {scopeLabel && scopeLabel !== "Вся Россия" ? ` · ${scopeLabel}` : ""}
              </p>
            </>
          : <p className="mt-1 text-sm text-black/60">Введите запрос в строке поиска в шапке сайта</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={typeTabHref(tab.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                type === tab.id ?
                  "bg-orange-500 text-white"
                : "border border-gray-200 bg-white text-black/80 hover:bg-black/[0.03]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {fetchError ?
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Не удалось выполнить поиск. Попробуйте ещё раз.
        </p>
      : null}

      {!loading && query && displayedResults.length === 0 && !fetchError ?
        <div className="py-12 text-center">
          <p className="text-lg text-black/70">Ничего не найдено</p>
          <p className="mt-2 text-sm text-black/55">
            Попробуйте изменить запрос или выбрать Вся Россия
          </p>
        </div>
      : null}

      <div className="mx-auto mt-4 w-full min-w-0 max-w-2xl">
        <ul className="flex w-full min-w-0 max-w-full flex-col gap-3">
          {!loading &&
            displayedResults.map((r) => {
              const listing = searchResultToListing(r);
              const ownerId = (listing.ownerId ?? "").trim();
              const href = appendReturnUrlQuery(r.href, returnHref);
              return (
                <li key={r.id} className="min-w-0 w-full max-w-full">
                  <CompactListingCard
                    listing={listing}
                    href={href}
                    viewCount={viewCounts[r.id] ?? 0}
                    publicAuthor={ownerId ? (publicByUserId[ownerId] ?? null) : null}
                  />
                </li>
              );
            })}
        </ul>

        {marketplaceLinks.length > 0 ?
          <section className="mt-8 border-t border-gray-200 pt-6" aria-label="Поиск на других площадках">
            <h2 className="text-sm font-semibold text-black">Искать также на других площадках</h2>
            <p className="mt-1 text-xs leading-snug text-black/50">
              Ссылки ведут на внешние сайты. Haliwali не отвечает за их объявления.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {marketplaceLinks.map((link) => (
                <a
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex max-w-full items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-black/85 hover:border-black/20 hover:bg-black/[0.02]"
                >
                  <span className="truncate">{link.label}</span>
                </a>
              ))}
            </div>
          </section>
        : null}

        {!loading ? <ExternalSearchResults items={externalResults} /> : null}
      </div>
    </main>
  );
}
