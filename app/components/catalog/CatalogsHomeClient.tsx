"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { CatalogCategory, CatalogCompanyListItem } from "../../lib/catalogTypes";
import { CatalogCategoryGrid } from "./CatalogCategoryGrid";
import { CatalogCompanyCard } from "./CatalogCompanyCard";
import { CatalogCompanySubmissionForm } from "./CatalogCompanySubmissionForm";
import { CatalogLegalDisclaimer } from "./CatalogLegalDisclaimer";

export function CatalogsHomeClient({
  categories,
  initialLoggedIn,
}: {
  categories: readonly CatalogCategory[];
  initialLoggedIn: boolean;
}) {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [companies, setCompanies] = useState<CatalogCompanyListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    setSubmittedQ(trimmed);
    if (trimmed.length < 2) {
      setCompanies([]);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ q: trimmed });
      const r = await fetch(`/api/catalogs/companies?${p.toString()}`, { cache: "no-store" });
      const data = (await r.json()) as { companies?: CatalogCompanyListItem[] };
      setCompanies(data.companies ?? []);
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">Компании</h1>
            <p className="mt-2 text-sm text-black/55 sm:text-base">
              Каталог компаний по отраслям — отдельно от объявлений Haliwali
            </p>
          </div>
          <CatalogCompanySubmissionForm categories={categories} initialLoggedIn={initialLoggedIn} />
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(q);
              }}
              placeholder="Поиск компаний..."
              className="h-11 w-full rounded-xl border border-black/[0.08] bg-white px-4 text-sm text-black shadow-sm outline-none placeholder:text-black/35 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void runSearch(q)}
            disabled={loading}
            className="h-11 w-28 shrink-0 rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000] disabled:opacity-50"
          >
            Найти
          </button>
        </div>

        {submittedQ.length >= 2 ?
          <div className="mt-6">
            <p className="mb-3 text-sm text-black/45">
              Результаты по запросу «{submittedQ}» · {companies.length}
            </p>
            {loading ?
              <p className="text-sm text-black/40">Загрузка...</p>
            : companies.length > 0 ?
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {companies.map((company) => (
                  <li key={company.slug}>
                    <CatalogCompanyCard company={company} />
                  </li>
                ))}
              </ul>
            : (
              <p className="rounded-2xl border border-black/[0.06] bg-white px-4 py-8 text-center text-sm text-black/50">
                Компании не найдены
              </p>
            )}
          </div>
        : null}

        <div className="mt-8">
          <CatalogCategoryGrid categories={categories} />
        </div>

        <p className="mt-8 text-center text-sm text-black/45">
          <Link href="/" className="font-medium text-[#c25a00] hover:underline">
            ← К объявлениям
          </Link>
        </p>
        <CatalogLegalDisclaimer className="mx-auto mt-4 max-w-2xl text-center" />
      </div>
    </div>
  );
}
