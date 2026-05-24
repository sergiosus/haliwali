"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CatalogCategory, CatalogCompanyListItem, CatalogReport } from "../lib/catalogTypes";
import { CATALOG_CATEGORY_SEED } from "../lib/catalogTypes";

type CatalogAdminTab = "overview" | "companies" | "categories" | "import" | "reports";

export function AdminCatalogPanel() {
  const [tab, setTab] = useState<CatalogAdminTab>("overview");
  const [companies, setCompanies] = useState<CatalogCompanyListItem[]>([]);
  const [reports, setReports] = useState<CatalogReport[]>([]);

  const loadCompanies = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: CatalogCompanyListItem[] }) => setCompanies(d.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  const loadReports = useCallback(() => {
    void fetch("/api/admin/catalog/reports", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { reports?: CatalogReport[] }) => setReports(d.reports ?? []))
      .catch(() => setReports([]));
  }, []);

  useEffect(() => {
    if (tab === "companies" || tab === "overview") loadCompanies();
    if (tab === "reports") loadReports();
  }, [tab, loadCompanies, loadReports]);

  const subTabs: { key: CatalogAdminTab; label: string }[] = [
    { key: "overview", label: "Каталоги" },
    { key: "companies", label: "Компании" },
    { key: "categories", label: "Категории" },
    { key: "import", label: "Импорт" },
    { key: "reports", label: "Жалобы" },
  ];

  const categories: CatalogCategory[] = CATALOG_CATEGORY_SEED.map((c) => ({
    ...c,
    companyCount: companies.filter((co) => co.categorySlug === c.slug).length,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ?
                "border-black/15 bg-black/[0.06] text-black"
              : "border-black/10 bg-white text-black/55 hover:text-black/75",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ?
        <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/65">
          <p>Каталог компаний отделён от объявлений. Данные в таблицах catalog_* (PostgreSQL).</p>
          <p className="mt-2">Компаний в базе: {companies.length}</p>
        </div>
      : null}

      {tab === "categories" ?
        <ul className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <li
              key={c.slug}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            >
              <span className="font-semibold text-black">{c.title}</span>
              <span className="text-black/45"> /catalogs/{c.slug}</span>
              <p className="mt-1 text-black/50">{c.companyCount} компаний</p>
            </li>
          ))}
        </ul>
      : null}

      {tab === "companies" ?
        <div className="space-y-2">
          {companies.length === 0 ?
            <p className="text-sm text-black/50">Нет компаний</p>
          : companies.map((co) => (
            <div
              key={co.slug}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            >
              <span className="font-semibold">{co.name}</span>
              <span className="text-black/45">
                {" "}
                · {co.categoryTitle} · {co.city}
              </span>
            </div>
          ))}
        </div>
      : null}

      {tab === "import" ?
        <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/65">
          <p>
            Импорт из публичных источников: сайты, справочники, VK, объявления, CSV. Поиск кандидатов
            через API. Черновики → проверка → публикация.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/catalogs/import"
              className="inline-flex rounded-full bg-black px-5 py-2.5 font-semibold text-white hover:bg-black/90"
            >
              Импорт / извлечение
            </Link>
            <Link
              href="/admin/catalogs/discover"
              className="inline-flex rounded-full border border-black/15 px-5 py-2.5 font-semibold hover:bg-black/5"
            >
              Поиск источников
            </Link>
          </div>
        </div>
      : null}

      {tab === "reports" ?
        <div className="space-y-2">
          {reports.length === 0 ?
            <p className="text-sm text-black/50">Жалоб пока нет</p>
          : reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
              <span className="font-medium">{r.reason}</span>
              {r.companyName ?
                <span className="text-black/50"> · {r.companyName}</span>
              : null}
              <p className="mt-1 text-black/55">{r.details}</p>
            </div>
          ))}
        </div>
      : null}
    </div>
  );
}
