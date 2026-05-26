"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCatalogCompanyEditModal } from "./AdminCatalogCompanyEditModal";
import { AdminCatalogClaimsSection } from "./AdminCatalogClaimsSection";
import { AdminCatalogImportCandidatesSection } from "./catalogs/AdminCatalogImportCandidatesSection";
import { AdminCatalogDraftsPanel } from "./catalogs/import/AdminCatalogDraftsPanel";
import {
  catalogCompanyOriginBadgeClass,
  catalogCompanyOriginLabel,
  catalogCompanyOriginView,
} from "../lib/catalogCompanyOrigin";
import { isLikelyBadCompanyName } from "../lib/catalogCompanyNameExtract";
import type {
  CatalogCategory,
  CatalogCompanyAdminItem,
  CatalogCompanyClaimRequest,
  CatalogReport,
} from "../lib/catalogTypes";
import { CATALOG_CATEGORY_SEED } from "../lib/catalogTypes";
import type { CatalogImportDraft } from "../lib/catalogImportTypes";

type CatalogAdminTab = "companies" | "categories" | "import" | "claims" | "reports";

export function AdminCatalogPanel() {
  const [tab, setTab] = useState<CatalogAdminTab>("companies");
  const [companies, setCompanies] = useState<CatalogCompanyAdminItem[]>([]);
  const [reports, setReports] = useState<CatalogReport[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<number>>(new Set());
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<CatalogCompanyAdminItem | null>(null);
  const [claimPendingCount, setClaimPendingCount] = useState(0);
  const [importActionCount, setImportActionCount] = useState(0);

  const loadCompanies = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: CatalogCompanyAdminItem[] }) => setCompanies(d.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  const loadReports = useCallback(() => {
    void fetch("/api/admin/catalog/reports", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { reports?: CatalogReport[] }) => setReports(d.reports ?? []))
      .catch(() => setReports([]));
  }, []);

  const setClaimCount = useCallback((count: number) => {
    setClaimPendingCount(count);
  }, []);

  const loadClaimCount = useCallback(() => {
    void fetch("/api/admin/catalog/companies/claims", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { claims?: CatalogCompanyClaimRequest[] }) => {
        setClaimCount((d.claims ?? []).filter((claim) => claim.status === "pending").length);
      })
      .catch(() => setClaimCount(0));
  }, [setClaimCount]);

  const loadImportActionCount = useCallback(() => {
    void fetch("/api/admin/catalogs/import/drafts", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { drafts?: CatalogImportDraft[] }) => {
        const count = (d.drafts ?? []).filter((draft) => {
          const status = String(draft.status ?? "").trim().toLowerCase();
          return status === "draft" || status === "new" || status === "pending" || status === "saved";
        }).length;
        setImportActionCount(count);
      })
      .catch(() => setImportActionCount(0));
  }, []);

  useEffect(() => {
    loadCompanies();
    loadReports();
    loadImportActionCount();
  }, [loadCompanies, loadReports, loadImportActionCount]);

  useEffect(() => {
    loadClaimCount();
  }, [loadClaimCount]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      loadCompanies();
      loadReports();
      loadImportActionCount();
      loadClaimCount();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadCompanies, loadReports, loadImportActionCount, loadClaimCount]);

  const filteredCompanies = useMemo(() => {
    if (!companyFilter) return companies;
    return companies.filter((co) => co.categorySlug === companyFilter);
  }, [companies, companyFilter]);

  const refreshCatalogCounts = useCallback(() => {
    loadCompanies();
    loadReports();
    loadImportActionCount();
    loadClaimCount();
  }, [loadCompanies, loadReports, loadImportActionCount, loadClaimCount]);

  const subTabs: { key: CatalogAdminTab; label: string; count: number }[] = [
    { key: "companies", label: "Компании в базе", count: companies.length },
    { key: "categories", label: "Категории", count: CATALOG_CATEGORY_SEED.length },
    { key: "import", label: "Импорт", count: importActionCount },
    { key: "claims", label: "Заявки на владение", count: claimPendingCount },
    { key: "reports", label: "Жалобы", count: reports.length },
  ];

  const categories: CatalogCategory[] = CATALOG_CATEGORY_SEED.map((c) => ({
    ...c,
    companyCount: companies.filter((co) => co.categorySlug === c.slug).length,
  }));

  function toggleCompanyId(id: number) {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCompanies() {
    setSelectedCompanyIds(new Set(filteredCompanies.map((c) => c.id)));
  }

  function clearCompanySelection() {
    setSelectedCompanyIds(new Set());
  }

  async function deleteSelectedCompanies() {
    if (selectedCompanyIds.size === 0) return;
    const ok = window.confirm("Удалить выбранные компании из каталога?");
    if (!ok) return;
    setCompanyBusy(true);
    setCompanyMessage(null);
    try {
      const r = await fetch("/api/admin/catalog/companies", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedCompanyIds] }),
      });
      const d = (await r.json()) as { ok?: boolean; deleted?: number; error?: string };
      if (!r.ok) {
        setCompanyMessage(d.error ?? "Ошибка удаления");
        return;
      }
      setCompanyMessage(`Удалено записей: ${d.deleted ?? 0}`);
      setSelectedCompanyIds(new Set());
      loadCompanies();
      refreshCatalogCounts();
    } catch {
      setCompanyMessage("Ошибка сети");
    } finally {
      setCompanyBusy(false);
    }
  }

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
            <span className="text-black/45"> ({t.count})</span>
          </button>
        ))}
      </div>

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
              <button
                type="button"
                onClick={() => {
                  setCompanyFilter(c.slug);
                  setTab("companies");
                }}
                className="mt-2 text-xs font-medium text-black/55 underline hover:text-black"
              >
                Показать компании
              </button>
            </li>
          ))}
        </ul>
      : null}

      {tab === "companies" ?
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Все категории</option>
              {CATALOG_CATEGORY_SEED.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={companyBusy || filteredCompanies.length === 0}
              onClick={selectAllCompanies}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
            >
              Выбрать все
            </button>
            <button
              type="button"
              disabled={companyBusy}
              onClick={clearCompanySelection}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
            >
              Снять выбор
            </button>
            <button
              type="button"
              disabled={companyBusy || selectedCompanyIds.size === 0}
              onClick={() => void deleteSelectedCompanies()}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 disabled:opacity-40"
            >
              Удалить выбранные ({selectedCompanyIds.size})
            </button>
          </div>
          {companyMessage ?
            <p className="text-sm font-medium text-black/70">{companyMessage}</p>
          : null}
          {filteredCompanies.length === 0 ?
            <p className="text-sm text-black/50">Нет компаний</p>
          : filteredCompanies.map((co) => (
            <div
              key={co.id}
              className="flex flex-wrap items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedCompanyIds.has(co.id)}
                onChange={() => toggleCompanyId(co.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{co.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${catalogCompanyOriginBadgeClass(catalogCompanyOriginView(co))}`}
                  >
                    {catalogCompanyOriginLabel(catalogCompanyOriginView(co))}
                  </span>
                  {isLikelyBadCompanyName(co.name) ?
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                      Можно редактировать
                    </span>
                  : null}
                </div>
                <span className="text-black/45">
                  {co.categoryTitle} · {co.city}
                  {co.serviceCities.length > 0 ? ` · ещё городов: ${co.serviceCities.length}` : ""}
                  {co.website ?
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={co.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        сайт
                      </a>
                    </>
                  : null}
                </span>
              </div>
              <button
                type="button"
                disabled={companyBusy}
                onClick={() => setEditingCompany(co)}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5"
              >
                Редактировать
              </button>
            </div>
          ))}
        </div>
      : null}

      {editingCompany ?
        <AdminCatalogCompanyEditModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSaved={(updated) => {
            setCompanies((list) => list.map((c) => (c.id === updated.id ? updated : c)));
            setCompanyMessage(`Сохранено: ${updated.name}`);
          }}
        />
      : null}

      {tab === "import" ?
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/admin/catalogs/import"
              className="inline-flex rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
            >
              Извлечение по URL / CSV
            </Link>
            <Link
              href="/admin/catalogs/import/drafts"
              className="inline-flex rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
            >
              Кандидаты
            </Link>
          </div>
          <AdminCatalogImportCandidatesSection compact onChanged={refreshCatalogCounts} />
          <AdminCatalogDraftsPanel showImportLink={false} onChanged={refreshCatalogCounts} />
        </div>
      : null}

      {tab === "claims" ?
        <AdminCatalogClaimsSection
          onPendingCountChange={setClaimCount}
          onChanged={refreshCatalogCounts}
        />
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
