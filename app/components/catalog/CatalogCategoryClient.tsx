"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogCategory, CatalogCompanyListItem } from "../../lib/catalogTypes";
import { CatalogCompanyCard } from "./CatalogCompanyCard";
import { CatalogCompanyMap } from "./CatalogCompanyMap";

type ViewMode = "cards" | "map";

export function CatalogCategoryClient({
  category,
  initialCompanies,
}: {
  category: CatalogCategory;
  initialCompanies: CatalogCompanyListItem[];
}) {
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [companies, setCompanies] = useState(initialCompanies);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/catalogs");
  }, [router]);

  const runSearch = useCallback(
    async (query: string) => {
      setLoading(true);
      setSubmittedQ(query.trim());
      try {
        const p = new URLSearchParams({ category: category.slug });
        if (query.trim().length >= 2) p.set("q", query.trim());
        const r = await fetch(`/api/catalogs/companies?${p.toString()}`, { cache: "no-store" });
        const data = (await r.json()) as { companies?: CatalogCompanyListItem[] };
        setCompanies(data.companies ?? []);
      } catch {
        setCompanies(initialCompanies);
      } finally {
        setLoading(false);
      }
    },
    [category.slug, initialCompanies],
  );

  useEffect(() => {
    setCompanies(initialCompanies);
  }, [initialCompanies]);

  const filteredLabel = useMemo(() => {
    if (!submittedQ) return null;
    return submittedQ;
  }, [submittedQ]);

  return (
    <div className="space-y-5">
      <header>
        <button
          type="button"
          onClick={goBack}
          className="mb-3 inline-flex h-9 w-fit items-center justify-center rounded-full border border-black/15 bg-white px-3 text-sm font-medium text-black/70 shadow-sm transition-colors hover:bg-black/[0.03]"
        >
          ← Назад
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{category.title}</h1>
        <p className="mt-1 text-sm text-black/50">{category.subtitle}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(q);
            }}
            placeholder="Поиск компаний…"
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
        <div className="flex rounded-xl border border-black/[0.08] bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === "cards" ? "bg-black/[0.06] text-black" : "text-black/50 hover:text-black/70"
            }`}
          >
            Карточки
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === "map" ? "bg-black/[0.06] text-black" : "text-black/50 hover:text-black/70"
            }`}
          >
            Карта
          </button>
        </div>
      </div>

      {filteredLabel ?
        <p className="text-sm text-black/45">
          Результаты по запросу «{filteredLabel}» · {companies.length}
        </p>
      : (
        <p className="text-sm text-black/45">{category.companyCount} компаний в категории</p>
      )}

      {loading ?
        <p className="text-sm text-black/40">Загрузка…</p>
      : null}

      {view === "map" ?
        <CatalogCompanyMap companies={companies} />
      : companies.length > 0 ?
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {companies.map((co) => (
            <li key={co.slug}>
              <CatalogCompanyCard company={co} />
            </li>
          ))}
        </ul>
      : (
        <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-10 text-center">
          <p className="text-sm text-black/50">Пока нет компаний в этой категории</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <a
              href="/admin/catalogs/discover"
              className="inline-flex rounded-full bg-[#ff7a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#f07000]"
            >
              Найти источники
            </a>
            <a
              href="/admin/catalogs/import"
              className="inline-flex rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
            >
              Добавить вручную
            </a>
            <a
              href="/admin/catalogs/import"
              className="inline-flex rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
            >
              Импорт CSV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
