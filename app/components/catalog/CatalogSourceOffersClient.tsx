"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogSourceName, CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { publicSourceFilterOptions } from "../../lib/catalogSourceRegistry";
import {
  OFFER_TYPE_LABELS,
  parseCatalogSourceOfferType,
  type CatalogSourceOfferType,
} from "../../lib/catalogSourceOfferType";
import {
  parseSourceOfferPageSize,
  type CatalogSourceOfferPageSize,
} from "../../lib/catalogSourceOfferQuery";
import { sourceOffersListHasFilters } from "../../lib/seoIndexability";
import { CatalogSourceOfferCard } from "./CatalogSourceOfferCard";

type Filters = {
  city: string;
  offerType: "" | CatalogSourceOfferType;
  brand: string;
  oemArticle: string;
  sourceName: string;
  priceMin: string;
  priceMax: string;
};

const OFFER_TYPE_OPTIONS: { value: "" | CatalogSourceOfferType; label: string }[] = [
  { value: "", label: "Все типы" },
  ...(
    Object.entries(OFFER_TYPE_LABELS) as [CatalogSourceOfferType, string][]
  ).map(([value, label]) => ({ value, label })),
];

const SOURCE_OPTIONS = publicSourceFilterOptions();

const PAGE_SIZE_OPTIONS: CatalogSourceOfferPageSize[] = [20, 50, 100];

function filtersFromSearchParams(sp: URLSearchParams): Filters {
  return {
    city: sp.get("city") ?? "",
    offerType: (() => {
      const raw = sp.get("offerType");
      if (!raw || raw === "all") return "";
      return parseCatalogSourceOfferType(raw);
    })(),
    brand: sp.get("brand") ?? "",
    oemArticle: sp.get("oem") ?? sp.get("oemArticle") ?? sp.get("article") ?? "",
    sourceName: sp.get("source") ?? sp.get("sourceName") ?? "",
    priceMin: sp.get("priceFrom") ?? sp.get("priceMin") ?? "",
    priceMax: sp.get("priceTo") ?? sp.get("priceMax") ?? "",
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
  if (filters.offerType) p.set("offerType", filters.offerType);
  if (filters.brand.trim()) p.set("brand", filters.brand.trim());
  if (filters.oemArticle.trim()) p.set("oem", filters.oemArticle.trim());
  if (filters.sourceName) p.set("source", filters.sourceName);
  const min = Number(filters.priceMin);
  const max = Number(filters.priceMax);
  if (Number.isFinite(min) && min > 0) p.set("priceFrom", String(min));
  if (Number.isFinite(max) && max > 0) p.set("priceTo", String(max));
  if (page > 1) p.set("page", String(page));
  if (pageSize !== 20) p.set("pageSize", String(pageSize));
  return p;
}

function hasActiveFilters(filters: Filters, q: string): boolean {
  const p = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed.length >= 1) p.set("q", trimmed);
  if (filters.city.trim()) p.set("city", filters.city.trim());
  if (filters.offerType) p.set("offerType", filters.offerType);
  if (filters.brand.trim()) p.set("brand", filters.brand.trim());
  if (filters.oemArticle.trim()) p.set("oem", filters.oemArticle.trim());
  if (filters.sourceName) p.set("source", filters.sourceName);
  if (filters.priceMin.trim()) p.set("priceFrom", filters.priceMin.trim());
  if (filters.priceMax.trim()) p.set("priceTo", filters.priceMax.trim());
  return sourceOffersListHasFilters(p);
}

function SourceOfferFiltersForm({
  draftFilters,
  setDraftFilters,
  onApply,
  loading,
  idPrefix = "",
}: {
  draftFilters: Filters;
  setDraftFilters: React.Dispatch<React.SetStateAction<Filters>>;
  onApply: () => void;
  loading: boolean;
  idPrefix?: string;
}) {
  const id = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs" htmlFor={id("city")}>
        <span className="font-medium text-black/55">Город</span>
        <input
          id={id("city")}
          value={draftFilters.city}
          onChange={(e) => setDraftFilters((f) => ({ ...f, city: e.target.value }))}
          placeholder="Ижевск"
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        />
      </label>

      <label className="block text-xs" htmlFor={id("offerType")}>
        <span className="font-medium text-black/55">Тип предложения</span>
        <select
          id={id("offerType")}
          value={draftFilters.offerType}
          onChange={(e) =>
            setDraftFilters((f) => ({
              ...f,
              offerType: e.target.value as Filters["offerType"],
            }))
          }
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        >
          {OFFER_TYPE_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs" htmlFor={id("source")}>
        <span className="font-medium text-black/55">Источник</span>
        <select
          id={id("source")}
          value={draftFilters.sourceName}
          onChange={(e) => setDraftFilters((f) => ({ ...f, sourceName: e.target.value }))}
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs" htmlFor={id("brand")}>
        <span className="font-medium text-black/55">Бренд</span>
        <input
          id={id("brand")}
          value={draftFilters.brand}
          onChange={(e) => setDraftFilters((f) => ({ ...f, brand: e.target.value }))}
          placeholder="Volkswagen"
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        />
      </label>

      <label className="block text-xs" htmlFor={id("oem")}>
        <span className="font-medium text-black/55">OEM / артикул</span>
        <input
          id={id("oem")}
          value={draftFilters.oemArticle}
          onChange={(e) => setDraftFilters((f) => ({ ...f, oemArticle: e.target.value }))}
          placeholder="1K0615301"
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        />
      </label>

      <label className="block text-xs" htmlFor={id("priceFrom")}>
        <span className="font-medium text-black/55">Цена от, ₽</span>
        <input
          id={id("priceFrom")}
          type="number"
          min={0}
          value={draftFilters.priceMin}
          onChange={(e) => setDraftFilters((f) => ({ ...f, priceMin: e.target.value }))}
          placeholder="100 000"
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        />
      </label>

      <label className="block text-xs" htmlFor={id("priceTo")}>
        <span className="font-medium text-black/55">Цена до, ₽</span>
        <input
          id={id("priceTo")}
          type="number"
          min={0}
          value={draftFilters.priceMax}
          onChange={(e) => setDraftFilters((f) => ({ ...f, priceMax: e.target.value }))}
          placeholder="500 000"
          className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        className="mt-1 h-10 w-full rounded-lg bg-black/[0.04] text-sm font-semibold text-black/75 hover:bg-black/[0.07] disabled:opacity-50"
      >
        Применить фильтры
      </button>
    </div>
  );
}

export function CatalogSourceOffersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [draftFilters, setDraftFilters] = useState<Filters>({
    city: "",
    offerType: "",
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
        const data = (await r.json()) as {
          ok?: boolean;
          offers?: CatalogSourceOffer[];
          total?: number;
          error?: string;
        };
        if (!r.ok || data.ok === false) {
          console.error("[source-offers]", data.error ?? r.statusText);
          setOffers([]);
          setTotal(0);
          return;
        }
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
      setMobileFiltersOpen(false);
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (appliedFilters.city.trim()) n += 1;
    if (appliedFilters.offerType) n += 1;
    if (appliedFilters.brand.trim()) n += 1;
    if (appliedFilters.oemArticle.trim()) n += 1;
    if (appliedFilters.sourceName) n += 1;
    if (appliedFilters.priceMin.trim()) n += 1;
    if (appliedFilters.priceMax.trim()) n += 1;
    return n;
  }, [appliedFilters]);

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

  const displayCityFallback = appliedFilters.city.trim() || undefined;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="max-w-3xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
            Объявления из источников
          </h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Поиск предложений с внешних площадок по названию, бренду и артикулу.
          </p>
        </header>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(1);
            }}
            placeholder="Например: touran, насос caterpillar, OEM 12345"
            className="h-12 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-4 text-sm shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 sm:text-base"
          />
          <button
            type="button"
            onClick={() => runSearch(1)}
            disabled={loading}
            className="h-12 shrink-0 rounded-xl bg-[#ff7a00] px-6 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50 sm:min-w-[8rem]"
          >
            Найти
          </button>
        </div>

        <button
          type="button"
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-medium text-black/70 lg:hidden"
          onClick={() => setMobileFiltersOpen(true)}
        >
          Фильтры
          {activeFilterCount > 0 ?
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
              {activeFilterCount}
            </span>
          : null}
        </button>

        {mobileFiltersOpen ?
          <div
            className="fixed inset-0 z-50 flex lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Фильтры"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Закрыть"
              onClick={() => setMobileFiltersOpen(false)}
            />
            <div className="relative ml-auto flex h-full w-[min(100%,20rem)] flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-black">Фильтры</h2>
                <button
                  type="button"
                  className="text-sm text-black/50"
                  onClick={() => setMobileFiltersOpen(false)}
                >
                  Закрыть
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <SourceOfferFiltersForm
                  idPrefix="mobile"
                  draftFilters={draftFilters}
                  setDraftFilters={setDraftFilters}
                  onApply={applyFilters}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        : null}

        <div className="mt-6 flex flex-col gap-6 lg:mt-8 lg:flex-row lg:items-start lg:gap-8">
          <aside className="hidden w-56 shrink-0 lg:block xl:w-60">
            <div className="sticky top-20 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-black">Фильтры</h2>
              <div className="mt-3">
                <SourceOfferFiltersForm
                  draftFilters={draftFilters}
                  setDraftFilters={setDraftFilters}
                  onApply={applyFilters}
                  loading={loading}
                />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-black" aria-live="polite">
              {countLabel}
              {submittedQ ?
                <span className="mt-1 block text-sm font-normal text-black/45">
                  Запрос: «{submittedQ}»
                </span>
              : null}
            </p>

            {loading ?
              <p className="mt-4 text-sm text-black/45">Загрузка объявлений…</p>
            : offers.length > 0 ?
              <>
                <ul className="mt-4 flex flex-col gap-4">
                  {offers.map((offer) => (
                    <li key={offer.id}>
                      <CatalogSourceOfferCard
                        offer={offer}
                        displayCityFallback={displayCityFallback}
                      />
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
      </div>
    </div>
  );
}
