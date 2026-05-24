"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { confidenceFromStored, confidenceLabelRu } from "../../../lib/catalogConfidence";
import { DISCOVERY_SOURCE_LABEL } from "../../../lib/catalogDiscoverSourceType";
import type { DiscoverySourceType } from "../../../lib/catalogDiscoverSourceType";
import type { CatalogImportDraft } from "../../../lib/catalogImportTypes";
import type { CatalogCompanyAdminItem } from "../../../lib/catalogTypes";

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  approved: "Одобрен",
  rejected: "Отклонён",
  published: "Опубликован",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Сайт",
  directory: "Справочник",
  vk: "VK",
  listing: "Объявление",
  text: "Текст",
  csv: "CSV",
  company_site: DISCOVERY_SOURCE_LABEL.company_site,
  vk_group: DISCOVERY_SOURCE_LABEL.vk_group,
  small_directory: DISCOVERY_SOURCE_LABEL.small_directory,
  aggregator: DISCOVERY_SOURCE_LABEL.aggregator,
  unknown: DISCOVERY_SOURCE_LABEL.unknown,
};

export function AdminCatalogDraftsPanel({ showImportLink = true }: { showImportLink?: boolean }) {
  const [drafts, setDrafts] = useState<CatalogImportDraft[]>([]);
  const [companies, setCompanies] = useState<CatalogCompanyAdminItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogImportDraft>>({});
  const [mergeCompanyId, setMergeCompanyId] = useState<Record<number, string>>({});

  const loadDrafts = useCallback(() => {
    void fetch("/api/admin/catalogs/import/drafts", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { drafts?: CatalogImportDraft[] }) => setDrafts(d.drafts ?? []))
      .catch(() => setDrafts([]));
  }, []);

  const loadCompanies = useCallback(() => {
    void fetch("/api/admin/catalog/companies", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companies?: CatalogCompanyAdminItem[] }) => setCompanies(d.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    loadDrafts();
    loadCompanies();
  }, [loadDrafts, loadCompanies]);

  async function runAction(action: "approve" | "reject" | "publish", ids: number[]) {
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
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        published?: number;
        skipped?: number;
        updated?: number;
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка");
        return;
      }
      if (action === "publish") {
        setMessage(`Опубликовано: ${d.published ?? 0}, пропущено: ${d.skipped ?? 0}`);
      } else {
        setMessage(`Обновлено: ${d.updated ?? 0}`);
      }
      setSelected(new Set());
      loadDrafts();
      loadCompanies();
    } finally {
      setBusy(false);
    }
  }

  async function runMerge(draftId: number, companyId: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", draftId, companyId }),
      });
      if (r.ok) {
        setMessage("Объединено с существующей компанией");
        loadDrafts();
        loadCompanies();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/catalogs/import/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id,
          patch: {
            name: editForm.name,
            categorySlug: editForm.categorySlug,
            city: editForm.city,
            address: editForm.address,
            phone: editForm.phone,
            email: editForm.email,
            website: editForm.website,
            description: editForm.description,
            sourceUrl: editForm.sourceUrl,
            imageUrl: editForm.imageUrl,
            confidenceScore: editForm.confidenceScore,
          },
        }),
      });
      if (r.ok) {
        setEditingId(null);
        loadDrafts();
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = [...selected];

  return (
    <div className="space-y-4">
      {showImportLink ?
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/catalogs/import"
            className="rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
          >
            Новый импорт
          </Link>
          <Link
            href="/admin/catalogs/discover"
            className="rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
          >
            Поиск источников
          </Link>
        </div>
      : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Черновики ({drafts.length})</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void runAction("approve", selectedIds)}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            Одобрить
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void runAction("reject", selectedIds)}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            Отклонить
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void runAction("publish", selectedIds)}
            className="rounded-full bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Опубликовать выбранные
          </button>
        </div>
      </div>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}

      {drafts.length === 0 ?
        <p className="text-sm text-black/50">Черновиков нет. Добавьте источники через импорт или поиск.</p>
      : drafts.map((d) => {
        const score100 = confidenceFromStored(d.confidenceScore ?? 0.5);
        const confLabel = confidenceLabelRu(score100);
        return (
          <article key={d.id} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                disabled={d.status === "published"}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id);
                    else next.add(d.id);
                    return next;
                  });
                }}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.name || "—"}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{STATUS_LABEL[d.status]}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-900">
                    {confLabel} ({score100})
                  </span>
                  {d.sourceType ?
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-900">
                      {SOURCE_LABEL[d.sourceType as DiscoverySourceType] ?? d.sourceType}
                    </span>
                  : null}
                  {d.needsReview ?
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Требует проверки
                    </span>
                  : null}
                </div>
                <p className="mt-1 text-black/55">
                  {d.categorySlug} · {d.city}
                  {d.address ? ` · ${d.address}` : ""}
                </p>
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
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium"
                  onClick={() => {
                    setEditingId(d.id);
                    setEditForm({ ...d });
                  }}
                >
                  Сохранить
                </button>
                {d.status !== "published" ?
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs"
                      onClick={() => void runAction("approve", [d.id])}
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs"
                      onClick={() => void runAction("reject", [d.id])}
                    >
                      Отклонить
                    </button>
                    {d.status === "approved" ?
                      <button
                        type="button"
                        className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white"
                        onClick={() => void runAction("publish", [d.id])}
                      >
                        Опубликовать
                      </button>
                    : null}
                  </>
                : null}
              </div>
            </div>

            {d.status !== "published" ?
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
                {(
                  [
                    ["name", "Название"],
                    ["categorySlug", "Категория"],
                    ["city", "Город"],
                    ["address", "Адрес"],
                    ["phone", "Телефон"],
                    ["email", "Email"],
                    ["website", "Сайт"],
                    ["sourceUrl", "source_url"],
                    ["imageUrl", "image_url"],
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
                    onClick={() => void saveEdit(d.id)}
                    className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Сохранить изменения
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-xs"
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
