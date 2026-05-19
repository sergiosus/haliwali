"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CompactListingCard } from "../components/CompactListingCard";
import { appendReturnUrlQuery } from "../lib/returnNavigation";
import { globalSearchScopeToQueryParams } from "../lib/globalSearchScopeParams";
import type { GlobalSearchListingTypeFilter, GlobalSearchResultItem } from "../lib/globalSearchTypes";
import type { Listing, ListingType } from "../lib/listingModel";
import { homepageLocationLabelFromScope } from "../lib/searchScopeLocation";
import { useCompactListingEnrichment } from "../lib/useCompactListingEnrichment";
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

export function SearchPageClient() {
  const sp = useSearchParams();
  const query = (sp.get("q") ?? "").trim();
  const typeParam = (sp.get("type") ?? "all").trim().toLowerCase();
  const type: GlobalSearchListingTypeFilter =
    typeParam === "task" || typeParam === "service" || typeParam === "product" ? typeParam : "all";

  const searchScope = useSearchScope();
  const scopeLabel = homepageLocationLabelFromScope(searchScope);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResultItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const listings = useMemo(() => results.map(searchResultToListing), [results]);
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

  const loadResults = useCallback(async () => {
    if (!query) {
      setResults([]);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const p = new URLSearchParams({ q: query, type, limit: "60" });
      const scopeP = globalSearchScopeToQueryParams(searchScope);
      for (const [k, v] of scopeP.entries()) p.set(k, v);
      const r = await fetch(`/api/search?${p.toString()}`, { cache: "no-store" });
      const d = (await r.json()) as { ok?: boolean; results?: GlobalSearchResultItem[]; error?: string };
      if (!r.ok || !d.ok) {
        setResults([]);
        setFetchError(d.error ?? "search_failed");
        return;
      }
      setResults(Array.isArray(d.results) ? d.results : []);
    } catch {
      setResults([]);
      setFetchError("search_failed");
    } finally {
      setLoading(false);
    }
  }, [query, type, searchScope]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  function typeTabHref(nextType: GlobalSearchListingTypeFilter) {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (nextType !== "all") p.set("type", nextType);
    const scopeP = globalSearchScopeToQueryParams(searchScope);
    for (const [k, v] of scopeP.entries()) p.set(k, v);
    const qs = p.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-3 py-6 sm:px-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black">Поиск</h1>
          {query ?
            <p className="mt-1 text-sm text-black/60">
              {loading ? "Ищем…" : `${results.length} результатов`}
              {query ? ` по запросу «${query}»` : ""}
              {scopeLabel && scopeLabel !== "Вся Россия" ? ` · ${scopeLabel}` : ""}
            </p>
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

      {!loading && query && results.length === 0 && !fetchError ?
        <p className="py-12 text-center text-lg text-black/60">Ничего не найдено</p>
      : null}

      <ul className="mt-4 flex flex-col gap-3">
        {results.map((r) => {
          const listing = searchResultToListing(r);
          const ownerId = (listing.ownerId ?? "").trim();
          const href = appendReturnUrlQuery(r.href, returnHref);
          return (
            <li key={r.id}>
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
    </main>
  );
}
