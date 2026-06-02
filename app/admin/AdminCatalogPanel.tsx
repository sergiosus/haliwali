"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCatalogCompaniesPanel, type CompanySubTab } from "./catalogs/AdminCatalogCompaniesPanel";
import { AdminCatalogOffersPanel, type OfferSubTab } from "./catalogs/AdminCatalogOffersPanel";
import { AdminCatalogSupplierSearchSection } from "./catalogs/AdminCatalogSupplierSearchSection";

export type CatalogAdminTab = "companies" | "offers" | "supplier-search";

export type { CompanySubTab, OfferSubTab };

export function AdminCatalogPanel({
  initialTab,
  initialCompanySubTab,
  initialOfferSubTab,
}: {
  initialTab?: CatalogAdminTab;
  initialCompanySubTab?: CompanySubTab;
  initialOfferSubTab?: OfferSubTab;
}) {
  const [tab, setTab] = useState<CatalogAdminTab>(initialTab ?? "companies");
  const [offerSubTab, setOfferSubTab] = useState<OfferSubTab | undefined>(initialOfferSubTab);
  const [companyCount, setCompanyCount] = useState(0);
  const [offerTotalCount, setOfferTotalCount] = useState(0);

  const loadCompanyCount = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: unknown[] }) => setCompanyCount(d.companies?.length ?? 0))
      .catch(() => setCompanyCount(0));
  }, []);

  const loadOfferCounts = useCallback(() => {
    void fetch("/api/admin/catalogs/source-offers/status", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          publishedCount?: number;
          candidatesCount?: number;
          importCount?: number;
          rejectedCount?: number;
          duplicateCount?: number;
        }) => {
          const total =
            (d.publishedCount ?? 0) +
            (d.candidatesCount ?? d.importCount ?? 0) +
            (d.rejectedCount ?? 0) +
            (d.duplicateCount ?? 0);
          setOfferTotalCount(total);
        },
      )
      .catch(() => setOfferTotalCount(0));
  }, []);

  const refreshCatalogCounts = useCallback(() => {
    loadCompanyCount();
    loadOfferCounts();
  }, [loadCompanyCount, loadOfferCounts]);

  useEffect(() => {
    loadCompanyCount();
    loadOfferCounts();
  }, [loadCompanyCount, loadOfferCounts]);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialOfferSubTab) setOfferSubTab(initialOfferSubTab);
  }, [initialOfferSubTab]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      refreshCatalogCounts();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshCatalogCounts]);

  const openOfferImport = useCallback(() => {
    setTab("offers");
    setOfferSubTab("import");
  }, []);

  const mainTabs: { key: CatalogAdminTab; label: string; count: number }[] = [
    { key: "companies", label: "Компании", count: companyCount },
    { key: "offers", label: "Предложения", count: offerTotalCount },
    { key: "supplier-search", label: "Поиск поставщиков", count: 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-50 -mx-1 flex flex-wrap gap-2 border-b border-black/5 bg-[#fff8f3]/95 px-1 pb-3 pt-1 backdrop-blur-sm">
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
            <span className="text-black/45"> ({t.count})</span>
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
        <AdminCatalogOffersPanel initialSubTab={offerSubTab} onChanged={refreshCatalogCounts} />
      : null}

      {tab === "supplier-search" ?
        <AdminCatalogSupplierSearchSection />
      : null}
    </div>
  );
}
