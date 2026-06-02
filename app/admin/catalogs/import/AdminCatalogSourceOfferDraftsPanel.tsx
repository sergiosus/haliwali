"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSourceOfferDraft, CatalogSourceOfferDraftStatus } from "../../../lib/catalogSourceOfferTypes";
import { sourceOfferRejectLabel } from "../../../lib/catalogSourceOfferValidation";
import { AdminCatalogSourceOfferMigrationWarning } from "../AdminCatalogSourceOfferMigrationWarning";
import {
  SourceOfferCoverThumb,
  SourceOfferModerationCardBody,
} from "../../../components/catalog/SourceOfferDisplay";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";

const STATUS_LABEL: Record<CatalogSourceOfferDraftStatus, string> = {
  draft: "Новые",
  saved: "Новые",
  approved: "Новые",
  rejected: "Отклонённые",
  published: "Опубликованные",
  duplicate: "Дубликаты",
};

const QUEUE_HEADING: Record<"candidates" | "rejected" | "duplicate", { title: string; hint: string }> = {
  candidates: {
    title: "Кандидаты предложений",
    hint: "Поиск → импорт → публикация напрямую. Без сохранения и одобрения.",
  },
  rejected: {
    title: "Отклонённые",
    hint: "Предложения, отклонённые при модерации.",
  },
  duplicate: {
    title: "Дубликаты",
    hint: "Найденные дубликаты уже существующих предложений.",
  },
};

function categoryTitle(slug: string): string {
  return CATALOG_CATEGORY_SEED.find((c) => c.slug === slug)?.title ?? slug;
}

type DraftAction = "publish" | "reject" | "delete";

export function AdminCatalogSourceOfferDraftsPanel({
  onChanged,
  embedded = false,
  refreshSignal,
  queueMode = "candidates",
}: {
  onChanged?: () => void;
  embedded?: boolean;
  refreshSignal?: number;
  queueMode?: "candidates" | "rejected" | "duplicate";
}) {
  const listStatus =
    queueMode === "rejected" ? "rejected"
    : queueMode === "duplicate" ? "duplicate"
    : "candidates";

  const [drafts, setDrafts] = useState<CatalogSourceOfferDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tablesReady, setTablesReady] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState<string[] | undefined>();

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/catalogs/source-offers/status", { cache: "no-store", credentials: "include" });
      const data = (await r.json()) as { tablesReady?: boolean; schemaMissing?: string[] };
      setTablesReady(data.tablesReady !== false);
      setSchemaMissing(data.schemaMissing);
    } catch {
      setTablesReady(false);
    }
  }, []);

  const load = useCallback(async (status: string) => {
    const r = await fetch(`/api/admin/catalogs/source-offers/drafts?status=${status}`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await r.json()) as { drafts?: CatalogSourceOfferDraft[] };
    setDrafts(data.drafts ?? []);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!tablesReady) return;
    void load(listStatus);
  }, [listStatus, load, tablesReady, refreshSignal]);

  const filtered = useMemo(() => drafts, [drafts]);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(filtered.map((d) => d.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  async function runAction(action: DraftAction, ids: number[]) {
    if (ids.length === 0) return;
    if (action === "delete") {
      const ok = window.confirm(`Удалить ${ids.length} кандидат(ов)?`);
      if (!ok) return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/catalogs/source-offers/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        deleted?: number;
      };
      if (!data.ok) {
        setMessage(data.message ?? data.error ?? "Ошибка");
        return;
      }
      if (action === "delete") {
        setMessage(`Удалено: ${data.deleted ?? ids.length}`);
      } else {
        setMessage(
          data.message ??
            (action === "publish" ? "Опубликовано в каталог предложений" : "Готово"),
        );
      }
      await load(listStatus);
      onChanged?.();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  if (!tablesReady) {
    return (
      <div className="space-y-3">
        <AdminCatalogSourceOfferMigrationWarning missing={schemaMissing} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {embedded ?
        <div>
          <h3 className="text-base font-semibold">{QUEUE_HEADING[queueMode].title}</h3>
          <p className="mt-1 text-sm text-black/55">{QUEUE_HEADING[queueMode].hint}</p>
        </div>
      : (
        <div>
          <h2 className="text-lg font-semibold">Кандидаты предложений</h2>
          <p className="mt-1 text-sm text-black/55">{QUEUE_HEADING.candidates.hint}</p>
        </div>
      )}

      {queueMode === "candidates" ?
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || filtered.length === 0}
            onClick={selectAllVisible}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
          >
            Выделить все
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={clearSelection}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Снять выбор
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("publish", [...selected])}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Опубликовать выбранные
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("reject", [...selected])}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 disabled:opacity-40"
          >
            Отклонить выбранные
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("delete", [...selected])}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 disabled:opacity-40"
          >
            Удалить выбранные
          </button>
        </div>
      : null}

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}

      <ul className="space-y-3">
        {filtered.map((d) => (
          <li key={d.id} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <div className="flex items-start gap-3">
              {queueMode === "candidates" ?
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(d.id)) next.delete(d.id);
                      else next.add(d.id);
                      return next;
                    });
                  }}
                  className="mt-1 shrink-0"
                />
              : null}
              <SourceOfferCoverThumb offer={d} size="admin" alt={d.title} />
              <SourceOfferModerationCardBody
                offer={d}
                meta={
                  <>
                    {queueMode === "duplicate" || d.duplicateHint ?
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900">
                        {d.duplicateHint ? "Дубликат" : STATUS_LABEL[d.status]}
                      </span>
                    : (
                      <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs">
                        {STATUS_LABEL[d.status] ?? d.status}
                      </span>
                    )}
                    {d.categorySlug ?
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs text-black/50">
                        {categoryTitle(d.categorySlug)}
                      </span>
                    : null}
                  </>
                }
              >
                {queueMode === "candidates" ?
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction("publish", [d.id])}
                      className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Опубликовать
                    </button>
                  </div>
                : null}
                {d.duplicateHint ?
                  <p className="mt-1 text-xs text-blue-800">
                    {sourceOfferRejectLabel(d.duplicateHint) ?? d.duplicateHint}
                    {d.duplicateOfOfferId ?
                      <a
                        href={`/catalogs/predlozheniya/${d.duplicateOfOfferId}`}
                        className="ml-1 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть существующее
                      </a>
                    : null}
                  </p>
                : null}
              </SourceOfferModerationCardBody>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ?
        <p className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/50">Нет записей</p>
      : null}
    </div>
  );
}
