"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCatalogCompaniesPanel, type CompanySubTab } from "./catalogs/AdminCatalogCompaniesPanel";
import { AdminCatalogOfferImportClient } from "./catalogs/import/AdminCatalogOfferImportClient";
import { AdminCatalogPublishedOffersPanel } from "./catalogs/AdminCatalogPublishedOffersPanel";
import { AdminCatalogSupplierSearchSection } from "./catalogs/AdminCatalogSupplierSearchSection";

export type CatalogAdminTab = "companies" | "offers" | "offer-import" | "supplier-search";

export type { CompanySubTab };

export function AdminCatalogPanel({
  initialTab,
  initialCompanySubTab,
}: {
  initialTab?: CatalogAdminTab;
  initialCompanySubTab?: CompanySubTab;
}) {
  const [tab, setTab] = useState<CatalogAdminTab>(initialTab ?? "companies");
  const [publishedOfferCount, setPublishedOfferCount] = useState(0);
  const [offerImportCount, setOfferImportCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);

  const loadOfferCounts = useCallback(() => {
    void fetch("/api/admin/catalogs/source-offers/status", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { publishedCount?: number; importCount?: number }) => {
        setPublishedOfferCount(d.publishedCount ?? 0);
        setOfferImportCount(d.importCount ?? 0);
      })
      .catch(() => {
        setPublishedOfferCount(0);
        setOfferImportCount(0);
      });
  }, []);

  const loadCompanyCount = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: unknown[] }) => setCompanyCount(d.companies?.length ?? 0))
      .catch(() => setCompanyCount(0));
  }, []);

  const refreshCatalogCounts = useCallback(() => {
    loadOfferCounts();
    loadCompanyCount();
  }, [loadOfferCounts, loadCompanyCount]);

  useEffect(() => {
    loadOfferCounts();
    loadCompanyCount();
  }, [loadOfferCounts, loadCompanyCount]);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      refreshCatalogCounts();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshCatalogCounts]);

  const openOfferImport = useCallback(() => {
    setTab("offer-import");
  }, []);

  const mainTabs: { key: CatalogAdminTab; label: string; count: number }[] = [
    { key: "companies", label: "Компании", count: companyCount },
    { key: "offers", label: "Предложения", count: publishedOfferCount },
    { key: "offer-import", label: "Импорт предложений", count: offerImportCount },
    { key: "supplier-search", label: "Поиск поставщиков", count: 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {mainTabs.map((t) => (
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
            {t.count > 0 || t.key === "companies" ?
              <span className="text-black/45"> ({t.count})</span>
            : null}
          </button>
        ))}
      </div>

      {tab === "companies" ?
        <AdminCatalogCompaniesPanel
          initialSubTab={initialCompanySubTab}
          onChanged={refreshCatalogCounts}
          onOpenOfferImport={openOfferImport}
        />
      : null}

      {tab === "offers" ?
        <AdminCatalogPublishedOffersPanel onChanged={refreshCatalogCounts} />
      : null}

      {tab === "offer-import" ?
        <AdminCatalogOfferImportClient onChanged={refreshCatalogCounts} />
      : null}

      {tab === "supplier-search" ?
        <AdminCatalogSupplierSearchSection />
      : null}
    </div>
  );
}
