"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { CatalogCategory, CatalogCompanyListItem } from "../../lib/catalogTypes";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { CatalogCompanyCard } from "./CatalogCompanyCard";
import { CatalogSourceOfferCard } from "./CatalogSourceOfferCard";

export function CatalogSupplierSearchClient({ categories }: { categories: readonly CatalogCategory[] }) {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [city, setCity] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [companies, setCompanies] = useState<CatalogCompanyListItem[]>([]);
  const [sourceOffers, setSourceOffers] = useState<CatalogSourceOffer[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async () => {
    const trimmed = q.trim();
    setSubmittedQ(trimmed);
    if (trimmed.length < 2) {
      setCompanies([]);
      setSourceOffers([]);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ q: trimmed });
      if (city.trim()) p.set("city", city.trim());
      if (categorySlug) p.set("category", categorySlug);
      const r = await fetch(`/api/catalogs/supplier-search?${p.toString()}`, { cache: "no-store" });
      const data = (await r.json()) as {
        companies?: CatalogCompanyListItem[];
        sourceOffers?: CatalogSourceOffer[];
      };
      setCompanies(data.companies ?? []);
      setSourceOffers(data.sourceOffers ?? []);
    } catch {
      setCompanies([]);
      setSourceOffers([]);
    } finally {
      setLoading(false);
    }
  }, [q, city, categorySlug]);

  const hasResults = companies.length > 0 || sourceOffers.length > 0;
  const searched = submittedQ.length >= 2;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">Поиск поставщиков</h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Единый поиск по компаниям каталога, объявлениям из внешних источников и OEM/артикулам.
          </p>
        </header>

        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="Компания, бренд, OEM, артикул, товар…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-4 text-sm shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={loading}
              className="h-11 shrink-0 rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50"
            >
              Найти
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-black/50">Город</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ижевск"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-black/50">Категория</span>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-sm"
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ?
          <p className="mt-8 text-sm text-black/45">Поиск…</p>
        : !searched ?
          <p className="mt-8 text-sm text-black/45">Введите минимум 2 символа для поиска.</p>
        : !hasResults ?
          <div className="mt-8 rounded-2xl border border-dashed border-black/[0.12] bg-white px-5 py-10 text-center">
            <p className="text-sm font-medium text-black/70">Ничего не найдено</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-black/45">
              Попробуйте другой запрос или перейдите в{" "}
              <Link href="/catalogs/companies" className="font-medium text-[#c25a00] hover:underline">
                Компании
              </Link>{" "}
              /{" "}
              <Link href="/catalogs/predlozheniya" className="font-medium text-[#c25a00] hover:underline">
                Объявления из источников
              </Link>
              .
            </p>
          </div>
        : (
          <div className="mt-8 space-y-10">
            {companies.length > 0 ?
              <section>
                <h2 className="text-lg font-semibold text-black">
                  Компании <span className="text-sm font-normal text-black/45">({companies.length})</span>
                </h2>
                <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {companies.map((company) => (
                    <li key={company.slug}>
                      <CatalogCompanyCard company={company} />
                    </li>
                  ))}
                </ul>
              </section>
            : null}

            {sourceOffers.length > 0 ?
              <section>
                <h2 className="text-lg font-semibold text-black">
                  Объявления из источников{" "}
                  <span className="text-sm font-normal text-black/45">({sourceOffers.length})</span>
                </h2>
                <p className="mt-1 text-xs text-black/45">
                  По брендам, OEM и артикулам — внешние предложения, не объявления пользователей Haliwali.
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {sourceOffers.map((offer) => (
                    <li key={offer.id}>
                      <CatalogSourceOfferCard offer={offer} />
                    </li>
                  ))}
                </ul>
              </section>
            : null}
          </div>
        )}
      </div>
    </div>
  );
}
