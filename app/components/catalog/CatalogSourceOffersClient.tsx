"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogCategory } from "../../lib/catalogTypes";
import type { CatalogSourceName, CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { CATALOG_SOURCE_NAME_LABEL } from "../../lib/catalogSourceName";
import {
  parseSourceOfferPageSize,
  type CatalogSourceOfferPageSize,
} from "../../lib/catalogSourceOfferQuery";
import { CatalogSourceOfferCard } from "./CatalogSourceOfferCard";

type Filters = {
  city: string;
  categorySlug: string;
  brand: string;
  oemArticle: string;
  sourceName: string;
  priceMin: string;
  priceMax: string;
};

const SOURCE_OPTIONS: { value: "" | CatalogSourceName; label: string }[] = [
  { value: "", label: "Все источники" },
  { value: "avito", label: CATALOG_SOURCE_NAME_LABEL.avito },
  { value: "drom", label: CATALOG_SOURCE_NAME_LABEL.drom },
  { value: "youla", label: CATALOG_SOURCE_NAME_LABEL.youla },
  { value: "vk", label: CATALOG_SOURCE_NAME_LABEL.vk },
  { value: "company_site", label: CATALOG_SOURCE_NAME_LABEL.company_site },
  { value: "other", label: CATALOG_SOURCE_NAME_LABEL.other },
];

const PAGE_SIZE_OPTIONS: CatalogSourceOfferPageSize[] = [20, 50, 100];

function filtersFromSearchParams(sp: URLSearchParams): Filters {
  return {
    city: sp.get("city") ?? "",
    categorySlug: sp.get("category") ?? sp.get("categorySlug") ?? "",
    brand: sp.get("brand") ?? "",
    oemArticle: sp.get("oem") ?? sp.get("oemArticle") ?? sp.get("article") ?? "",
    sourceName: sp.get("sourceName") ?? sp.get("source") ?? "",
    priceMin: sp.get("priceMin") ?? sp.get("priceFrom") ?? "",
    priceMax: sp.get("priceMax") ?? sp.get("priceTo") ?? "",
  };
}

function buildParams(
  q: string,
  filters: Filters,
  page: number,
  pageSize: CatalogSourceOfferPageSize,
): URLSearchParams {
  const p = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed.length >= 1) p.set("q", trimmed);
  if (filters.city.trim()) p.set("city", filters.city.trim());
  if (filters.categorySlug) p.set("category", filters.categorySlug);
  if (filters.brand.trim()) p.set("brand", filters.brand.trim());
  if (filters.oemArticle.trim()) p.set("oem", filters.oemArticle.trim());
  if (filters.sourceName) p.set("sourceName", filters.sourceName);
  const min = Number(filters.priceMin);
  const max = Number(filters.priceMax);
  if (Number.isFinite(min) && min > 0) p.set("priceMin", String(min));
  if (Number.isFinite(max) && max > 0) p.set("priceMax", String(max));
  if (page > 1) p.set("page", String(page));
  if (pageSize !== 20) p.set("pageSize", String(pageSize));
  return p;
}

function hasActiveFilters(filters: Filters, q: string): boolean {
  return (
    q.trim().length >= 1 ||
    Boolean(filters.city.trim()) ||
    Boolean(filters.categorySlug) ||
    Boolean(filters.brand.trim()) ||
    Boolean(filters.oemArticle.trim()) ||
    Boolean(filters.sourceName) ||
    Boolean(filters.priceMin.trim()) ||
    Boolean(filters.priceMax.trim())
  );
}

export function CatalogSourceOffersClient({ categories }: { categories: readonly CatalogCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [draftFilters, setDraftFilters] = useState<Filters>({
    city: "",
    categorySlug: "",
    brand: "",
    oemArticle: "",
    sourceName: "",
    priceMin: "",
    priceMax: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>(draftFilters);
  const [offers, setOffers] = useState<CatalogSourceOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<CatalogSourceOfferPageSize>(20);
  const [hydrated, setHydrated] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const syncUrl = useCallback(
    (query: string, f: Filters, p: number, ps: CatalogSourceOfferPageSize) => {
      const params = buildParams(query, f, p, ps);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const load = useCallback(
    async (query: string, f: Filters, p: number, ps: CatalogSourceOfferPageSize) => {
      setLoading(true);
      try {
        const params = buildParams(query, f, p, ps);
        const r = await fetch(`/api/catalogs/source-offers?${params.toString()}`, { cache: "no-store" });
        const data = (await r.json()) as { offers?: CatalogSourceOffer[]; total?: number };
        setOffers(data.offers ?? []);
        setTotal(data.total ?? data.offers?.length ?? 0);
      } catch {
        setOffers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const spQ = searchParams.get("q") ?? "";
    const f = filtersFromSearchParams(searchParams);
    const ps = parseSourceOfferPageSize(searchParams.get("pageSize"));
    const p = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    setQ(spQ);
    setSubmittedQ(spQ);
    setDraftFilters(f);
    setAppliedFilters(f);
    setPageSize(ps);
    setPage(p);
    setHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    void load(submittedQ, appliedFilters, safePage, pageSize);
  }, [hydrated, submittedQ, appliedFilters, safePage, pageSize, load]);

  const runSearch = useCallback(
    (nextPage = 1) => {
      const trimmed = q.trim();
      setSubmittedQ(trimmed);
      setAppliedFilters(draftFilters);
      setPage(nextPage);
      syncUrl(trimmed, draftFilters, nextPage, pageSize);
    },
    [q, draftFilters, pageSize, syncUrl],
  );

  const applyFilters = useCallback(() => {
    runSearch(1);
  }, [runSearch]);

  const active = useMemo(
    () => hasActiveFilters(appliedFilters, submittedQ),
    [appliedFilters, submittedQ],
  );

  const countLabel = useMemo(() => {
    if (loading) return "Загрузка…";
    const n = total.toLocaleString("ru-RU");
    const word =
      total % 10 === 1 && total % 100 !== 11 ? "предложение"
      : total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 10 || total % 100 >= 20) ?
        "предложения"
      : "предложений";
    return `Найдено: ${n} ${word}`;
  }, [loading, total]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-3xl px-3 py-6 sm:max-w-4xl sm:px-6 sm:py-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
            Объявления из источников
          </h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Индекс внешних предложений (Avito, Drom, Youla, VK). Поиск по названию, описанию, бренду и
            артикулу.
          </p>
        </header>

        <div className="mt-5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch(1);
              }}
              placeholder="Например: touran, насос caterpillar, OEM 12345"
              className="h-11 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-4 text-sm shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => runSearch(1)}
              disabled={loading}
              className="h-11 shrink-0 rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50"
            >
              Найти
            </button>
          </div>

          <div className="grid gap-2 rounded-2xl border border-black/[0.08] bg-white p-3 sm:grid-cols-2">
            <label className="block text-xs sm:col-span-2">
              <span className="text-black/50">Город</span>
              <input
                value={draftFilters.city}
                onChange={(e) => setDraftFilters((f) => ({ ...f, city: e.target.value }))}
                placeholder="Ижевск"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Бренд</span>
              <input
                value={draftFilters.brand}
                onChange={(e) => setDraftFilters((f) => ({ ...f, brand: e.target.value }))}
                placeholder="Volkswagen"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">OEM / артикул</span>
              <input
                value={draftFilters.oemArticle}
                onChange={(e) => setDraftFilters((f) => ({ ...f, oemArticle: e.target.value }))}
                placeholder="1K0615301"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Источник</span>
              <select
                value={draftFilters.sourceName}
                onChange={(e) => setDraftFilters((f) => ({ ...f, sourceName: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Цена от, ₽</span>
              <input
                type="number"
                min={0}
                value={draftFilters.priceMin}
                onChange={(e) => setDraftFilters((f) => ({ ...f, priceMin: e.target.value }))}
                placeholder="100 000"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Цена до, ₽</span>
              <input
                type="number"
                min={0}
                value={draftFilters.priceMax}
                onChange={(e) => setDraftFilters((f) => ({ ...f, priceMax: e.target.value }))}
                placeholder="500 000"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-black/50">Категория (необязательно)</span>
              <select
                value={draftFilters.categorySlug}
                onChange={(e) => setDraftFilters((f) => ({ ...f, categorySlug: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end sm:col-span-2">
              <button
                type="button"
                onClick={applyFilters}
                disabled={loading}
                className="h-9 w-full rounded-lg border border-black/15 text-sm font-medium text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
              >
                Применить фильтры
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-lg font-semibold text-black" aria-live="polite">
          {countLabel}
          {submittedQ ?
            <span className="mt-1 block text-sm font-normal text-black/45">Запрос: «{submittedQ}»</span>
          : null}
        </p>

        {loading ?
          <p className="mt-4 text-sm text-black/45">Загрузка объявлений…</p>
        : offers.length > 0 ?
          <>
            <ul className="mt-4 flex flex-col gap-4">
              {offers.map((offer) => (
                <li key={offer.id}>
                  <CatalogSourceOfferCard offer={offer} />
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-3 border-t border-black/[0.08] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-black/60">
                На странице
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const ps = Number(e.target.value) as CatalogSourceOfferPageSize;
                    setPageSize(ps);
                    setPage(1);
                    syncUrl(submittedQ, appliedFilters, 1, ps);
                  }}
                  className="rounded-lg border border-black/15 px-2 py-1.5"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loading || safePage <= 1}
                  onClick={() => {
                    const prev = safePage - 1;
                    setPage(prev);
                    syncUrl(submittedQ, appliedFilters, prev, pageSize);
                  }}
                  className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-40"
                >
                  ← Назад
                </button>
                <span className="px-2 text-sm text-black/55">
                  Страница {safePage} из {totalPages}
                </span>
                <button
                  type="button"
                  disabled={loading || safePage >= totalPages}
                  onClick={() => {
                    const next = safePage + 1;
                    setPage(next);
                    syncUrl(submittedQ, appliedFilters, next, pageSize);
                  }}
                  className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-40"
                >
                  Вперёд →
                </button>
              </div>
            </div>
          </>
        : (
          <div className="mt-6 rounded-2xl border border-dashed border-black/[0.12] bg-white px-5 py-10 text-center">
            <p className="text-sm font-medium text-black/70">
              {active ? "Ничего не найдено" : "Пока нет опубликованных предложений"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-black/45">
              {active ?
                "Измените запрос или фильтры."
              : "После одобрения в админке импортированные объявления появятся здесь."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
