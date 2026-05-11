"use client";

import { useEffect, useMemo, useState } from "react";
import type { ListingViewStatsPayload } from "../lib/listingViewStatsTypes";

type StatsResponse = {
  ok?: boolean;
  stats?: ListingViewStatsPayload;
  readOnly?: boolean;
  error?: string;
};

function formatInt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(n)));
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-black/[0.02] px-3 py-2.5">
      <p className="text-[11px] text-black/55">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-black">{formatInt(value)}</p>
    </section>
  );
}

export function ListingStatsModal({
  open,
  listingId,
  listingTitle,
  onClose,
}: {
  open: boolean;
  listingId: string;
  listingTitle?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ListingViewStatsPayload | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = listingId.trim();
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/listings/${encodeURIComponent(id)}/stats`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as StatsResponse | null;
        if (cancelled) return;
        if (!r.ok) {
          setStats(null);
          setError(data?.error === "FORBIDDEN" ? "Нет доступа к статистике" : "Не удалось загрузить статистику");
          return;
        }
        setStats(data?.stats ?? null);
        setReadOnly(Boolean(data?.readOnly));
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setError("Не удалось загрузить статистику");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, listingId]);

  const dailyMax = useMemo(() => {
    if (!stats?.daily.length) return 1;
    return Math.max(1, ...stats.daily.map((d) => d.views));
  }, [stats]);

  if (!open) return null;

  return (
    <section
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="max-h-[min(92dvh,760px)] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Статистика объявления"
      >
        <header className="flex items-start justify-between gap-3">
          <section>
            <h2 className="text-lg font-semibold text-black/90">Статистика</h2>
            {listingTitle?.trim() ? <p className="mt-1 text-sm text-black/60">{listingTitle.trim()}</p> : null}
            {readOnly ? <p className="mt-1 text-xs text-black/45">Только просмотр (администратор)</p> : null}
          </section>
          <button type="button" onClick={onClose} className="rounded-xl px-2 py-1 text-sm text-black/55 hover:bg-black/[0.04]">
            Закрыть
          </button>
        </header>

        {loading ? <p className="mt-6 text-sm text-black/60">Загрузка…</p> : null}
        {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}

        {stats && !loading ? (
          <section className="mt-5 space-y-5">
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCard label="Всего просмотров" value={stats.total} />
              <StatCard label="Сегодня" value={stats.today} />
              <StatCard label="За 7 дней" value={stats.last7Days} />
              <StatCard label="За 30 дней" value={stats.last30Days} />
              <StatCard label="Уникальные зрители (30 дн.)" value={stats.uniqueViewers} />
            </section>

            <section>
              <h3 className="text-sm font-medium text-black/80">Города (30 дней)</h3>
              {stats.cities.length ? (
                <ul className="mt-2 space-y-2">
                  {stats.cities.map((row) => (
                    <li key={row.city} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-black/80">{row.city}</span>
                      <span className="shrink-0 text-black/55">
                        {formatInt(row.views)}
                        {row.share > 0 ? ` · ${row.share.toFixed(1)}%` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-black/55">Пока нет данных по городам.</p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium text-black/80">Просмотры по дням (30 дней)</h3>
              <section className="mt-3 flex h-36 items-end gap-1" aria-hidden>
                {stats.daily.map((row) => (
                  <span
                    key={row.date}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={`${row.date}: ${row.views}`}
                  >
                    <span
                      className="w-full rounded-t bg-orange-500/80"
                      style={{ height: `${Math.max(4, Math.round((row.views / dailyMax) * 100))}%` }}
                    />
                  </span>
                ))}
              </section>
              <section className="mt-2 flex justify-between text-[10px] text-black/45">
                <span>{stats.daily[0]?.date ?? ""}</span>
                <span>{stats.daily[stats.daily.length - 1]?.date ?? ""}</span>
              </section>
            </section>
          </section>
        ) : null}
      </section>
    </section>
  );
}
