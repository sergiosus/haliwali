"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";
import { AdminCatalogSourceOfferMigrationWarning } from "./AdminCatalogSourceOfferMigrationWarning";
import {
  SourceOfferCoverThumb,
  SourceOfferModerationCardBody,
} from "../../components/catalog/SourceOfferDisplay";

export function AdminCatalogPublishedOffersPanel({ onChanged }: { onChanged?: () => void }) {
  const [offers, setOffers] = useState<CatalogSourceOffer[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [syncDebug, setSyncDebug] = useState<Record<string, unknown> | null>(null);
  const [schemaMissing, setSchemaMissing] = useState<string[] | undefined>();

  const load = useCallback(async () => {
    try {
      const [statusRes, offersRes] = await Promise.all([
        fetch("/api/admin/catalogs/source-offers/status", { cache: "no-store", credentials: "include" }),
        fetch("/api/admin/catalogs/source-offers", { cache: "no-store", credentials: "include" }),
      ]);
      const statusData = (await statusRes.json()) as {
        tablesReady?: boolean;
        schemaMissing?: string[];
        publishedOffersCountFromDb?: number;
        publicApiCount?: number;
        draftsApprovedCount?: number;
        draftsPublishedCount?: number;
        tableUsedByAdmin?: string;
        tableUsedByPublicApi?: string;
        listQueryError?: string;
      };
      const offersData = (await offersRes.json()) as { offers?: CatalogSourceOffer[]; error?: string };
      setTablesReady(statusData.tablesReady !== false);
      setSchemaMissing(statusData.schemaMissing);
      setOffers(offersData.offers ?? []);
      setSyncDebug({
        publishedOffersCountFromDb: statusData.publishedOffersCountFromDb,
        publicApiCount: statusData.publicApiCount,
        draftsApprovedCount: statusData.draftsApprovedCount,
        draftsPublishedCount: statusData.draftsPublishedCount,
        tableUsedByAdmin: statusData.tableUsedByAdmin,
        tableUsedByPublicApi: statusData.tableUsedByPublicApi,
        listQueryError: statusData.listQueryError ?? offersData.error,
      });
      setSelected(new Set());
    } catch {
      setOffers([]);
      setTablesReady(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(`Снять с публикации ${ids.length} предложений?`);
    if (!ok) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/catalogs/source-offers", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await r.json()) as { ok?: boolean; deleted?: number; error?: string };
      if (!data.ok) {
        setMessage(data.error ?? "Ошибка удаления");
        return;
      }
      setMessage(`Удалено: ${data.deleted ?? 0}`);
      await load();
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
      <div>
        <h2 className="text-lg font-semibold">Предложения</h2>
        <p className="mt-1 text-sm text-black/55">
          Опубликованные объявления из внешних источников. Отображаются в каталоге на сайте.
        </p>
        {syncDebug ?
          <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/[0.04] p-2 text-[11px] leading-snug text-black/60">
            {JSON.stringify(syncDebug, null, 2)}
          </pre>
        : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void removeSelected()}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 disabled:opacity-40"
        >
          Снять с публикации ({selected.size})
        </button>
      </div>

      {message ?
        <p className="text-sm font-medium text-black/70">{message}</p>
      : null}

      <ul className="space-y-3">
        {offers.map((o) => (
          <li key={o.id} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.id)) next.delete(o.id);
                    else next.add(o.id);
                    return next;
                  });
                }}
                className="mt-1"
              />
              <SourceOfferCoverThumb offer={o} size="admin" />
              <SourceOfferModerationCardBody
                offer={o}
                meta={
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    Опубликовано
                  </span>
                }
              />
            </div>
          </li>
        ))}
      </ul>

      {offers.length === 0 ?
        <p className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/50">Нет опубликованных предложений</p>
      : null}
    </div>
  );
}
