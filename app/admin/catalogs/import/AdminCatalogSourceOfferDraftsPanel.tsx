"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { catalogSourceNameLabel } from "../../../lib/catalogSourceName";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";
import type { CatalogSourceOfferDraft, CatalogSourceOfferDraftStatus } from "../../../lib/catalogSourceOfferTypes";
import { sourceOfferRejectLabel } from "../../../lib/catalogSourceOfferValidation";
import { AdminCatalogSourceOfferMigrationWarning } from "../AdminCatalogSourceOfferMigrationWarning";

const STATUS_LABEL: Record<CatalogSourceOfferDraftStatus, string> = {
  draft: "Новые",
  saved: "Сохранённые",
  approved: "Одобренные",
  rejected: "Отклонённые",
  published: "Опубликованные",
  duplicate: "Дубликаты",
};

const CANDIDATE_TABS: CatalogSourceOfferDraftStatus[] = ["draft", "saved", "approved"];

const QUEUE_HEADING: Record<"candidates" | "rejected" | "duplicate", { title: string; hint: string }> = {
  candidates: {
    title: "Кандидаты предложений",
    hint: "Очередь модерации: новые, сохранённые и одобренные перед публикацией.",
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
  const initialTab =
    queueMode === "rejected" ? "rejected"
    : queueMode === "duplicate" ? "duplicate"
    : "draft";
  const [tab, setTab] = useState<CatalogSourceOfferDraftStatus>(initialTab);
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

  const load = useCallback(async (status: CatalogSourceOfferDraftStatus) => {
    const r = await fetch(`/api/admin/catalogs/source-offers/drafts?status=${status}`, { cache: "no-store" });
    const data = (await r.json()) as { drafts?: CatalogSourceOfferDraft[] };
    setDrafts(data.drafts ?? []);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (queueMode === "rejected") setTab("rejected");
    else if (queueMode === "duplicate") setTab("duplicate");
  }, [queueMode]);

  useEffect(() => {
    if (!tablesReady) return;
    void load(tab);
  }, [tab, load, tablesReady, refreshSignal, queueMode]);

  const filtered = useMemo(() => drafts, [drafts]);

  async function runAction(action: "save" | "approve" | "reject" | "publish") {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/catalogs/source-offers/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; message?: string };
      if (!data.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setMessage(
        data.message ??
          (action === "publish" ? "Опубликовано в «Предложения»" : "Готово"),
      );
      await load(tab);
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
          <p className="mt-1 text-sm text-black/55">
            Поля объявления: название, цена, город, категория, продавец, источник, бренд, OEM.
          </p>
        </div>
      )}

      {queueMode === "candidates" ?
        <div className="flex flex-wrap gap-2">
          {CANDIDATE_TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                tab === id ? "border-black/20 bg-black/[0.06] text-black" : "border-black/10 text-black/55",
              ].join(" ")}
            >
              {STATUS_LABEL[id]}
            </button>
          ))}
        </div>
      : null}

      {queueMode === "candidates" ?
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("save")}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Сохранить
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("approve")}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Одобрить
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0 || tab !== "approved"}
            onClick={() => void runAction("publish")}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Опубликовать
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runAction("reject")}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 disabled:opacity-40"
          >
            Отклонить
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
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-black">{d.title}</span>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-900">
                    {catalogSourceNameLabel(d.sourceName)}
                  </span>
                  {queueMode === "duplicate" || d.duplicateHint ?
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900">
                      {d.duplicateHint ? "Дубликат" : d.status}
                    </span>
                  : (
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs">{STATUS_LABEL[d.status] ?? d.status}</span>
                  )}
                </div>
                <p className="mt-1 text-black/55">
                  {[d.price, d.city, categoryTitle(d.categorySlug)].filter(Boolean).join(" · ")}
                </p>
                {(d.companyName || d.sellerName) && (
                  <p className="mt-1 text-xs text-black/50">
                    {d.companyName ? `Компания: ${d.companyName}` : ""}
                    {d.companyName && d.sellerName ? " · " : ""}
                    {d.sellerName ? `Продавец: ${d.sellerName}` : ""}
                  </p>
                )}
                {d.shortSnippet ?
                  <p className="mt-1 line-clamp-2 text-black/45">{d.shortSnippet}</p>
                : null}
                {(d.brand || d.oemCodes.length > 0 || d.articleCodes.length > 0) && (
                  <p className="mt-1 text-xs text-black/40">
                    {d.brand ? `Бренд: ${d.brand}` : ""}
                    {d.oemCodes.length > 0 ? ` · OEM: ${d.oemCodes.join(", ")}` : ""}
                    {d.articleCodes.length > 0 ? ` · Арт.: ${d.articleCodes.join(", ")}` : ""}
                  </p>
                )}
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-[#c25a00] underline"
                >
                  {d.sourceUrl}
                </a>
                {d.duplicateHint ?
                  <p className="mt-1 text-xs text-blue-800">
                    {sourceOfferRejectLabel(d.duplicateHint) ?? d.duplicateHint}
                    {d.duplicateOfOfferId ?
                      <a
                        href={`/catalogs/predlozheniya#offer-${d.duplicateOfOfferId}`}
                        className="ml-1 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть существующее
                      </a>
                    : null}
                  </p>
                : null}
              </div>
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
