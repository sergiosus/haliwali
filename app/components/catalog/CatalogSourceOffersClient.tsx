"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogCategory } from "../../lib/catalogTypes";
import type { CatalogSourceName, CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { CATALOG_SOURCE_NAME_LABEL } from "../../lib/catalogSourceName";
import { CatalogSourceOfferCard } from "./CatalogSourceOfferCard";

type Filters = {
  city: string;
  categorySlug: string;
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

function buildParams(q: string, filters: Filters): URLSearchParams {
  const p = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed.length >= 2) p.set("q", trimmed);
  if (filters.city.trim()) p.set("city", filters.city.trim());
  if (filters.categorySlug) p.set("category", filters.categorySlug);
  if (filters.sourceName) p.set("sourceName", filters.sourceName);
  const min = Number(filters.priceMin);
  const max = Number(filters.priceMax);
  if (Number.isFinite(min) && min > 0) p.set("priceMin", String(min));
  if (Number.isFinite(max) && max > 0) p.set("priceMax", String(max));
  return p;
}

function hasActiveFilters(filters: Filters, q: string): boolean {
  return (
    q.trim().length >= 2 ||
    Boolean(filters.city.trim()) ||
    Boolean(filters.categorySlug) ||
    Boolean(filters.sourceName) ||
    Boolean(filters.priceMin.trim()) ||
    Boolean(filters.priceMax.trim())
  );
}

export function CatalogSourceOffersClient({ categories }: { categories: readonly CatalogCategory[] }) {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [filters, setFilters] = useState<Filters>({
    city: "",
    categorySlug: "",
    sourceName: "",
    priceMin: "",
    priceMax: "",
  });
  const [offers, setOffers] = useState<CatalogSourceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query: string, f: Filters) => {
    setLoading(true);
    try {
      const p = buildParams(query, f);
      const r = await fetch(`/api/catalogs/source-offers?${p.toString()}`, { cache: "no-store" });
      const data = (await r.json()) as { offers?: CatalogSourceOffer[] };
      setOffers(data.offers ?? []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(() => {
    setSubmittedQ(q.trim());
    void load(q, filters);
  }, [q, filters, load]);

  useEffect(() => {
    void load("", filters);
  }, [load]);

  const active = useMemo(() => hasActiveFilters(filters, submittedQ), [filters, submittedQ]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
            Объявления из источников
          </h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Индекс внешних предложений (Avito, Drom, VK, сайты компаний). Отдельно от объявлений
            пользователей Haliwali.
          </p>
        </header>

        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="Поиск по объявлениям, брендам, OEM, артикулам…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-4 text-sm shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={loading}
              className="h-11 shrink-0 rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50"
            >
              Найти
            </button>
          </div>

          <div className="grid gap-2 rounded-2xl border border-black/[0.08] bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs">
              <span className="text-black/50">Город</span>
              <input
                value={filters.city}
                onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                placeholder="Ижевск"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Категория</span>
              <select
                value={filters.categorySlug}
                onChange={(e) => setFilters((f) => ({ ...f, categorySlug: e.target.value }))}
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
            <label className="block text-xs">
              <span className="text-black/50">Источник</span>
              <select
                value={filters.sourceName}
                onChange={(e) => setFilters((f) => ({ ...f, sourceName: e.target.value }))}
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
                value={filters.priceMin}
                onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
                placeholder="1000"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Цена до, ₽</span>
              <input
                type="number"
                min={0}
                value={filters.priceMax}
                onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
                placeholder="50000"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 px-2.5 text-sm"
              />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <button
                type="button"
                onClick={runSearch}
                disabled={loading}
                className="h-9 w-full rounded-lg border border-black/15 text-sm font-medium text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
              >
                Применить фильтры
              </button>
            </div>
          </div>
        </div>

        {loading ?
          <p className="mt-8 text-sm text-black/45">Загрузка…</p>
        : offers.length > 0 ?
          <>
            <p className="mt-6 text-sm text-black/45">
              Найдено: {offers.length}
              {submittedQ.length >= 2 ? ` · запрос «${submittedQ}»` : null}
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {offers.map((offer) => (
                <li key={offer.id}>
                  <CatalogSourceOfferCard offer={offer} />
                </li>
              ))}
            </ul>
          </>
        : (
          <div className="mt-8 rounded-2xl border border-dashed border-black/[0.12] bg-white px-5 py-10 text-center">
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
