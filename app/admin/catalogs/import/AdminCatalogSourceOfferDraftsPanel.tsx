"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { catalogSourceNameLabel } from "../../../lib/catalogSourceName";
import type { CatalogSourceOfferDraft, CatalogSourceOfferDraftStatus } from "../../../lib/catalogSourceOfferTypes";

const STATUS_LABEL: Record<CatalogSourceOfferDraftStatus, string> = {
  draft: "Новые",
  saved: "Сохранённые",
  approved: "Одобренные",
  rejected: "Отклонённые",
  published: "Опубликованные",
  duplicate: "Дубликаты",
};

const TABS: CatalogSourceOfferDraftStatus[] = [
  "draft",
  "saved",
  "approved",
  "published",
  "duplicate",
  "rejected",
];

export function AdminCatalogSourceOfferDraftsPanel() {
  const [tab, setTab] = useState<CatalogSourceOfferDraftStatus>("draft");
  const [drafts, setDrafts] = useState<CatalogSourceOfferDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (status: CatalogSourceOfferDraftStatus) => {
    const r = await fetch(`/api/admin/catalogs/source-offers/drafts?status=${status}`, { cache: "no-store" });
    const data = (await r.json()) as { drafts?: CatalogSourceOfferDraft[] };
    setDrafts(data.drafts ?? []);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

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
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setMessage(action === "publish" ? "Опубликовано в «Объявления из источников»" : "Готово");
      await load(tab);
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Объявления из источников — кандидаты</h2>
        <p className="mt-1 text-sm text-black/55">
          Импорт с Avito/Drom и др. попадает сюда, не в каталог компаний и не в объявления пользователей.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((id) => (
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
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs">{d.status}</span>
                </div>
                <p className="mt-1 text-black/55">
                  {[d.companyName || d.sellerName, d.city, d.price].filter(Boolean).join(" · ")}
                </p>
                {d.shortSnippet ?
                  <p className="mt-1 line-clamp-2 text-black/45">{d.shortSnippet}</p>
                : null}
                {(d.brand || d.oemCodes.length > 0) && (
                  <p className="mt-1 text-xs text-black/40">
                    {d.brand ? `Бренд: ${d.brand}` : ""}
                    {d.oemCodes.length > 0 ? ` · OEM: ${d.oemCodes.join(", ")}` : ""}
                  </p>
                )}
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-[#c25a00] underline"
                >
                  Оригинал
                </a>
                {d.duplicateHint ?
                  <p className="mt-1 text-xs text-blue-800">
                    {d.duplicateHint}
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
