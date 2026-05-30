"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confidenceFromStored, confidenceLabelRu } from "../../../lib/catalogConfidence";
import {
  catalogCompanyOriginBadgeClass,
  catalogCompanyOriginFromDraftPayload,
  catalogCompanyOriginLabel,
} from "../../../lib/catalogCompanyOrigin";
import { DISCOVERY_SOURCE_LABEL } from "../../../lib/catalogDiscoverSourceType";
import type { DiscoverySourceType } from "../../../lib/catalogDiscoverSourceType";
import type { CatalogImportDraft, CatalogImportDraftStatus, CatalogImportSession } from "../../../lib/catalogImportTypes";
import { isLikelyBadCompanyName } from "../../../lib/catalogCompanyNameExtract";
import { CATALOG_CATEGORY_SEED, type CatalogCompanyAdminItem } from "../../../lib/catalogTypes";

const STATUS_LABEL: Record<CatalogImportDraftStatus, string> = {
  draft: "Кандидат",
  saved: "Сохранён",
  approved: "Одобрен",
  rejected: "Отклонён",
  published: "Опубликован",
};

const TABS: { id: CatalogImportDraftStatus | "duplicate"; label: string }[] = [
  { id: "draft", label: "Новые" },
  { id: "saved", label: "Сохранённые" },
  { id: "approved", label: "Одобренные" },
  { id: "published", label: "Опубликованные" },
  { id: "rejected", label: "Отклонённые" },
  { id: "duplicate", label: "Дубликаты" },
];

const NAME_SOURCE_LABEL: Record<string, string> = {
  jsonld_org: "JSON-LD Organization",
  footer: "Подвал сайта",
  contact: "Блок контактов",
  meta_org: "Meta organization",
  og_site: "og:site_name",
  branding: "Логотип / бренд",
  fallback: "Резерв",
  none: "—",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Сайт",
  directory: "Справочник",
  vk: "VK",
  listing: "Объявление",
  text: "Текст",
  csv: "CSV",
  user_submitted: "Добавлено владельцем",
  owner_submitted: "Добавлено владельцем",
  company_site: DISCOVERY_SOURCE_LABEL.company_site,
  vk_group: DISCOVERY_SOURCE_LABEL.vk_group,
  small_directory: DISCOVERY_SOURCE_LABEL.small_directory,
  aggregator: DISCOVERY_SOURCE_LABEL.aggregator,
  unknown: DISCOVERY_SOURCE_LABEL.unknown,
};

type DraftSort =
  | "new_first"
  | "old_first"
  | "confidence_high"
  | "confidence_low"
  | "name_asc"
  | "name_desc";

const SORT_OPTIONS: { id: DraftSort; label: string }[] = [
  { id: "new_first", label: "Сначала новые" },
  { id: "old_first", label: "Сначала старые" },
  { id: "confidence_high", label: "Высокое доверие" },
  { id: "confidence_low", label: "Низкое доверие" },
  { id: "name_asc", label: "По названию А–Я" },
  { id: "name_desc", label: "По названию Я–А" },
];

const KNOWN_CATEGORY_SLUGS = new Set(CATALOG_CATEGORY_SEED.map((c) => c.slug));

function draftCategoryFilterKey(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !KNOWN_CATEGORY_SLUGS.has(normalized)) return "drugie";
  return normalized;
}

function compareDrafts(a: CatalogImportDraft, b: CatalogImportDraft, sort: DraftSort): number {
  switch (sort) {
    case "old_first":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "confidence_high":
      return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
    case "confidence_low":
      return (a.confidenceScore ?? 0) - (b.confidenceScore ?? 0);
    case "name_asc":
      return (a.name || "").localeCompare(b.name || "", "ru", { sensitivity: "base" });
    case "name_desc":
      return (b.name || "").localeCompare(a.name || "", "ru", { sensitivity: "base" });
    case "new_first":
    default:
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
}

type DraftEditForm = Partial<CatalogImportDraft> & {
  primaryCity?: string;
  serviceCities?: string;
};

function splitDraftCity(city: string): { primaryCity: string; serviceCities: string } {
  const parts = city.split(/[,;]+/).map((part) => part.trim()).filter(Boolean);
  return {
    primaryCity: parts[0] ?? city.trim(),
    serviceCities: parts.slice(1).join(", "),
  };
}

function draftEditForm(draft: CatalogImportDraft): DraftEditForm {
  const city = splitDraftCity(draft.city);
  return { ...draft, ...city };
}

function draftEditCity(form: DraftEditForm): string {
  const primary = String(form.primaryCity ?? form.city ?? "").trim();
  const serviceCities = String(form.serviceCities ?? "")
    .split(/[,;]+/)
    .map((city) => city.trim())
    .filter(Boolean);
  return [primary, ...serviceCities].filter(Boolean).join(", ");
}

type ConfirmJson = {
  ok?: boolean;
  error?: string;
  draft?: CatalogImportDraft;
  updated?: number;
  deleted?: number;
  published?: number;
  skipped?: number;
};

function apiErrorMessage(code?: string): string {
  const messages: Record<string, string> = {
    INVALID_ACTION: "Недопустимое действие",
    ID_REQUIRED: "Не указан кандидат",
    IDS_REQUIRED: "Не выбраны записи",
    NOT_FOUND: "Кандидат не найден",
    MERGE_FAILED: "Не удалось объединить",
  };
  return (code && messages[code]) || code || "Ошибка";
}

function patchFromEditForm(form: DraftEditForm): Record<string, unknown> {
  return {
    name: form.name,
    categorySlug: form.categorySlug,
    city: draftEditCity(form),
    address: form.address,
    phone: form.phone,
    email: form.email,
    website: form.website,
    description: form.description,
    sourceUrl: form.sourceUrl,
    imageUrl: form.imageUrl,
    confidenceScore: form.confidenceScore,
  };
}

function patchFromDraft(draft: CatalogImportDraft): Record<string, unknown> {
  return {
    name: draft.name,
    categorySlug: draft.categorySlug,
    city: draft.city,
    address: draft.address,
    phone: draft.phone,
    email: draft.email,
    website: draft.website,
    description: draft.description,
    sourceUrl: draft.sourceUrl,
    imageUrl: draft.imageUrl,
    confidenceScore: draft.confidenceScore,
  };
}

export function AdminCatalogDraftsPanel({
  onChanged,
  refreshSignal = 0,
}: {
  onChanged?: () => void;
  refreshSignal?: number;
}) {
  const [tab, setTab] = useState<CatalogImportDraftStatus | "duplicate">("draft");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<DraftSort>("new_first");
  const [drafts, setDrafts] = useState<CatalogImportDraft[]>([]);
  const [sessions, setSessions] = useState<CatalogImportSession[]>([]);
  const [companies, setCompanies] = useState<CatalogCompanyAdminItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<DraftEditForm>({});
  const [mergeCompanyId, setMergeCompanyId] = useState<Record<number, string>>({});

  const loadDrafts = useCallback(() => {
    const url =
      tab === "duplicate" ?
        "/api/admin/catalogs/import/drafts"
      : `/api/admin/catalogs/import/drafts?status=${tab}`;
    void fetch(url, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { drafts?: CatalogImportDraft[] }) => {
        let list = d.drafts ?? [];
        if (tab === "duplicate") {
          list = list.filter((draft) => Boolean(draft.duplicateHint || draft.duplicateOfCompanyId));
        }
        setDrafts(list);
      })
      .catch(() => setDrafts([]));
  }, [tab]);

  const loadSessions = useCallback(() => {
    void fetch("/api/admin/catalogs/import/sessions", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { sessions?: CatalogImportSession[] }) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  const loadCompanies = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: CatalogCompanyAdminItem[] }) => setCompanies(d.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    loadDrafts();
    loadSessions();
    loadCompanies();
    setSelected(new Set());
    setCategoryFilter("all");
  }, [loadDrafts, loadSessions, loadCompanies, refreshSignal]);

  function removeDraftsFromList(ids: number[]) {
    const idSet = new Set(ids);
    setDrafts((prev) => prev.filter((x) => !idSet.has(x.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    if (editingId != null && idSet.has(editingId)) setEditingId(null);
  }

  async function runAction(action: "save" | "approve" | "reject" | "publish", ids: number[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const d = (await r.json()) as ConfirmJson;
      if (!r.ok || d.ok === false) {
        setMessage(apiErrorMessage(d.error));
        return;
      }
      removeDraftsFromList(ids);
      if (action === "publish") {
        setMessage(`Опубликовано: ${d.published ?? 0}, пропущено: ${d.skipped ?? 0}`);
      } else if (action === "approve") {
        const n = d.updated ?? ids.length;
        setMessage(ids.length === 1 ? "Кандидат одобрен" : `Одобрено: ${n}`);
      } else if (action === "reject") {
        setMessage(`Отклонено: ${d.updated ?? ids.length}`);
      } else {
        setMessage(`Сохранено в очередь: ${d.updated ?? ids.length}`);
      }
      onChanged?.();
      void loadDrafts();
      void loadCompanies();
    } catch {
      setMessage("Ошибка сети. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  }

  async function runMerge(draftId: number, companyId: number) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", draftId, companyId }),
      });
      const d = (await r.json()) as ConfirmJson;
      if (!r.ok || d.ok === false) {
        setMessage(apiErrorMessage(d.error));
        return;
      }
      removeDraftsFromList([draftId]);
      setMessage("Объединено с существующей компанией");
      onChanged?.();
      void loadDrafts();
      void loadCompanies();
    } catch {
      setMessage("Ошибка сети. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(draft: CatalogImportDraft) {
    setEditingId(draft.id);
    setEditForm(draftEditForm(draft));
  }

  async function persistDraftUpdate(
    id: number,
    patch: Record<string, unknown>,
    opts?: { closeEditor?: boolean },
  ): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, patch }),
      });
      const d = (await r.json()) as ConfirmJson;
      if (!r.ok || d.ok === false || !d.draft) {
        setMessage(apiErrorMessage(d.error));
        return false;
      }
      setDrafts((prev) => prev.map((x) => (x.id === id ? d.draft! : x)));
      if (opts?.closeEditor) setEditingId(null);
      setMessage("Сохранено");
      return true;
    } catch {
      setMessage("Ошибка сети. Повторите попытку.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    await persistDraftUpdate(id, patchFromEditForm(editForm), { closeEditor: true });
  }

  async function saveDraftRow(draft: CatalogImportDraft) {
    if (editingId === draft.id) {
      await saveEdit(draft.id);
      return;
    }
    await persistDraftUpdate(draft.id, patchFromDraft(draft));
  }

  async function runDelete(ids: number[]) {
    if (ids.length === 0) return;
    const confirmText =
      ids.length === 1 ?
        (() => {
          const one = drafts.find((x) => x.id === ids[0]);
          const label = one?.name?.trim() || "этого кандидата";
          return `Удалить «${label}»? Это действие нельзя отменить.`;
        })()
      : `Удалить выбранных кандидатов (${ids.length})? Это действие нельзя отменить.`;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const d = (await r.json()) as ConfirmJson;
      if (!r.ok || d.ok === false) {
        setMessage(apiErrorMessage(d.error));
        return;
      }
      const deleted = d.deleted ?? ids.length;
      removeDraftsFromList(ids);
      setMessage(`Удалено: ${deleted}`);
      onChanged?.();
    } catch {
      setMessage("Ошибка сети. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: drafts.length };
    for (const category of CATALOG_CATEGORY_SEED) {
      counts[category.slug] = 0;
    }
    for (const draft of drafts) {
      const key = draftCategoryFilterKey(draft.categorySlug);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    const list =
      categoryFilter === "all" ?
        drafts
      : drafts.filter((d) => draftCategoryFilterKey(d.categorySlug) === categoryFilter);
    return [...list].sort((a, b) => compareDrafts(a, b, sortBy));
  }, [drafts, categoryFilter, sortBy]);

  const visibleIds = filteredDrafts.map((d) => d.id);
  const selectedIds = [...selected];
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  }

  const canReject = tab === "draft" || tab === "saved" || tab === "approved" || tab === "duplicate";
  const canApprove = tab === "draft" || tab === "saved" || tab === "rejected" || tab === "duplicate";
  const selectedCount = selectedIds.length;
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? tab;

  return (
    <div className="space-y-4">
      {sessions.length > 0 ?
        <details className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium">Последние импорты ({sessions.length})</summary>
          <ul className="mt-3 space-y-2 text-black/65">
            {sessions.slice(0, 12).map((s) => (
              <li key={s.id} className="border-b border-black/5 pb-2 last:border-0">
                <span className="text-black/40">{new Date(s.createdAt).toLocaleString("ru-RU")}</span>
                {" · "}
                {s.categorySlug} · {s.city || "—"} · {s.resultCount} шт.
                {s.query ?
                  <p className="mt-0.5 line-clamp-2 text-xs text-black/45">{s.query}</p>
                : null}
              </li>
            ))}
          </ul>
        </details>
      : null}

      <div className="flex flex-wrap gap-2 border-b border-black/10 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === t.id ? "bg-black text-white" : "border border-black/15 hover:bg-black/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold">Кандидаты компаний</h2>
          <span className="text-sm text-black/55">
            {tabLabel} · показано {filteredDrafts.length}
            {drafts.length !== filteredDrafts.length ? ` из ${drafts.length}` : ""}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              categoryFilter === "all" ?
                "border-black/20 bg-black/[0.06] text-black"
              : "border-black/10 bg-white text-black/55 hover:text-black/75",
            ].join(" ")}
          >
            Все ({categoryCounts.all ?? 0})
          </button>
          {CATALOG_CATEGORY_SEED.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => setCategoryFilter(category.slug)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                categoryFilter === category.slug ?
                  "border-black/20 bg-black/[0.06] text-black"
                : "border-black/10 bg-white text-black/55 hover:text-black/75",
              ].join(" ")}
            >
              {category.title} ({categoryCounts[category.slug] ?? 0})
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-black/10 pt-3">
          <label className="flex items-center gap-2 text-sm text-black/60">
            <span>Сортировка</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as DraftSort)}
              disabled={busy}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/10 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-black">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={busy || filteredDrafts.length === 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 shrink-0 rounded border-black/30"
            />
            Выделить все
          </label>
          {selectedCount > 0 ?
            <span className="text-sm font-medium text-black/70">Выбрано: {selectedCount}</span>
          : null}
        </div>

        {selectedCount > 0 || tab === "rejected" ?
          <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
            {canApprove ?
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={() => void runAction("approve", selectedIds)}
                className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Одобрить выбранные
              </button>
            : null}
            {canReject ?
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction("reject", selectedIds)}
                className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Отклонить выбранные
              </button>
            : null}
            <button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={() => void runDelete(selectedIds)}
              className="rounded-full border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-40"
            >
              Удалить выбранные
            </button>
          </div>
        : null}
      </section>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}

      {drafts.length === 0 ?
        <p className="text-sm text-black/50">В этой очереди записей нет.</p>
      : filteredDrafts.length === 0 ?
        <p className="text-sm text-black/50">Нет кандидатов в выбранной категории.</p>
      : filteredDrafts.map((d) => {
        const score100 = confidenceFromStored(d.confidenceScore ?? 0.5);
        const confLabel = confidenceLabelRu(score100);
        const displayStatus: CatalogImportDraftStatus = tab === "rejected" ? "rejected" : d.status;
        const originView = catalogCompanyOriginFromDraftPayload(d.rawPayload);
        return (
          <article key={d.id} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                disabled={busy}
                aria-label={`Выбрать ${d.name || "кандидата"}`}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id);
                    else next.add(d.id);
                    return next;
                  });
                }}
                className="mt-1 h-4 w-4 shrink-0 rounded border-black/30"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.name || "—"}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{STATUS_LABEL[displayStatus]}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-900">
                    {confLabel} ({score100})
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${catalogCompanyOriginBadgeClass(originView)}`}
                  >
                    {catalogCompanyOriginLabel(originView)}
                  </span>
                  {d.sourceType ?
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-900">
                      {SOURCE_LABEL[d.sourceType as DiscoverySourceType] ?? d.sourceType}
                    </span>
                  : null}
                  {d.needsReview || isLikelyBadCompanyName(d.name) ?
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Можно редактировать
                    </span>
                  : null}
                </div>
                <p className="mt-1 text-black/55">
                  {d.categorySlug} · {d.city}
                  {d.address ? ` · ${d.address}` : ""}
                </p>
                {d.rawPayload?.rootDomain ?
                  <p className="mt-1 text-xs text-black/45">
                    домен: {String(d.rawPayload.rootDomain)}
                    {d.rawPayload?.nameSource ?
                      ` · источник названия: ${NAME_SOURCE_LABEL[String(d.rawPayload.nameSource)] ?? String(d.rawPayload.nameSource)}`
                    : ""}
                  </p>
                : null}
                <p className="mt-1 text-black/55">
                  {[d.phone, d.email, d.website].filter(Boolean).join(" · ") || "—"}
                </p>
                {d.description ?
                  <p className="mt-2 line-clamp-3 text-black/60">{d.description}</p>
                : null}
                {d.imageUrl ?
                  <p className="mt-1 truncate text-xs text-black/45">image: {d.imageUrl}</p>
                : null}
                {(d.sourceUrlDisplay ?? d.sourceUrl) ?
                  <a
                    href={d.sourceUrlDisplay ?? d.sourceUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs underline text-black/45"
                  >
                    {d.sourceUrlDisplay ?? d.sourceUrl}
                  </a>
                : null}
                {d.duplicateHint ?
                  <p className="mt-2 font-medium text-orange-700">{d.duplicateHint}</p>
                : null}
                {d.warnings.length > 0 ?
                  <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
                    {d.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                : null}
                <p className="mt-1 text-xs text-black/35">
                  обновлено {new Date(d.updatedAt).toLocaleString("ru-RU")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {displayStatus === "draft" ?
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      onClick={() => openEdit(d)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void saveDraftRow(d)}
                    >
                      {busy ? "…" : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("approve", [d.id])}
                    >
                      {busy ? "…" : "Одобрить"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("reject", [d.id])}
                    >
                      {busy ? "…" : "Отклонить"}
                    </button>
                  </>
                : null}
                {displayStatus === "published" ?
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                    onClick={() => openEdit(d)}
                  >
                    Редактировать
                  </button>
                : null}
                {displayStatus === "rejected" ?
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      onClick={() => openEdit(d)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("approve", [d.id])}
                    >
                      {busy ? "…" : "Одобрить"}
                    </button>
                  </>
                : null}
                {displayStatus === "saved" ?
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      onClick={() => openEdit(d)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("approve", [d.id])}
                    >
                      {busy ? "…" : "Одобрить"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("reject", [d.id])}
                    >
                      {busy ? "…" : "Отклонить"}
                    </button>
                  </>
                : null}
                {displayStatus === "approved" ?
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      onClick={() => void runAction("publish", [d.id])}
                    >
                      {busy ? "…" : "Опубликовать"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs disabled:opacity-40"
                      onClick={() => void runAction("reject", [d.id])}
                    >
                      {busy ? "…" : "Отклонить"}
                    </button>
                  </>
                : null}
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-red-200 px-2.5 py-1 text-xs text-red-800 disabled:opacity-40"
                  onClick={() => void runDelete([d.id])}
                >
                  {busy ? "…" : "Удалить"}
                </button>
              </div>
            </div>

            {displayStatus !== "published" && displayStatus !== "rejected" ?
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/10 pt-3">
                <label className="text-xs text-black/55">
                  Объединить дубликат
                  <select
                    value={mergeCompanyId[d.id] ?? String(d.duplicateOfCompanyId ?? "")}
                    onChange={(e) => setMergeCompanyId((m) => ({ ...m, [d.id]: e.target.value }))}
                    className="mt-0.5 block min-w-[200px] rounded-lg border border-black/15 px-2 py-1"
                  >
                    <option value="">— компания —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.city})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !mergeCompanyId[d.id]}
                  onClick={() => void runMerge(d.id, Number(mergeCompanyId[d.id]))}
                  className="rounded-full border border-black/15 px-3 py-1 text-xs disabled:opacity-40"
                >
                  Объединить
                </button>
              </div>
            : null}

            {editingId === d.id ?
              <div className="mt-4 grid gap-2 border-t border-black/10 pt-4 sm:grid-cols-2">
                <label className="block text-xs">
                  Название
                  <input
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                  />
                </label>
                <label className="block text-xs">
                  Категория
                  <select
                    value={editForm.categorySlug ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, categorySlug: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                  >
                    <option value="">— категория —</option>
                    {CATALOG_CATEGORY_SEED.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  Город / primaryCity
                  <input
                    value={editForm.primaryCity ?? editForm.city ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, primaryCity: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                  />
                </label>
                <label className="block text-xs">
                  serviceCities
                  <input
                    value={editForm.serviceCities ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, serviceCities: e.target.value }))}
                    placeholder="Через запятую"
                    className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                  />
                </label>
                {(
                  [
                    ["address", "Адрес"],
                    ["phone", "Телефон"],
                    ["email", "Email"],
                    ["website", "Сайт"],
                    ["sourceUrl", "Source URL"],
                    ["imageUrl", "Logo URL"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-xs">
                    {label}
                    <input
                      value={String(editForm[key] ?? "")}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                    />
                  </label>
                ))}
                <label className="block text-xs sm:col-span-2">
                  Описание
                  <textarea
                    value={editForm.description ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="mt-0.5 w-full rounded-lg border border-black/15 px-2 py-1.5"
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEdit(d.id)}
                    className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            : null}
          </article>
        );
      })}
    </div>
  );
}
