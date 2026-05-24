"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SettlementLocationField } from "../../../components/location/SettlementLocationField";
import { DISCOVERY_SOURCE_LABEL, type DiscoverySourceType } from "../../../lib/catalogDiscoverSourceType";
import type { RankedSearchCandidate } from "../../../lib/catalogDiscoverRanking";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../../lib/catalogDiscoverLocationStorage";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";

export default function AdminCatalogDiscoverClient() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<CatalogDiscoverLocation | null>(null);
  const [categorySlug, setCategorySlug] = useState("auto");
  const [visible, setVisible] = useState<RankedSearchCandidate[]>([]);
  const [hidden, setHidden] = useState<RankedSearchCandidate[]>([]);
  const [groups, setGroups] = useState<Record<string, RankedSearchCandidate[]>>({});
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, []);

  const cityLabel = catalogDiscoverCityLabel(location);

  const list = showHidden ? [...visible, ...hidden] : visible;
  const displayGroups = showHidden
    ? list.reduce<Record<string, RankedSearchCandidate[]>>((acc, c) => {
        if (!acc[c.domain]) acc[c.domain] = [];
        acc[c.domain]!.push(c);
        return acc;
      }, {})
    : groups;

  async function runSearch() {
    setBusy(true);
    setMessage(null);
    setVisible([]);
    setHidden([]);
    setGroups({});
    setSelected(new Set());
    try {
      const r = await fetch("/api/admin/catalogs/discover/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          city: cityLabel,
          categorySlug,
          settlementId: location?.settlementId ?? null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          region: location?.region ?? "",
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        candidates?: RankedSearchCandidate[];
        hidden?: RankedSearchCandidate[];
        groups?: Record<string, RankedSearchCandidate[]>;
        count?: number;
        hiddenCount?: number;
        queriesUsed?: string[];
      };
      if (!r.ok) {
        setMessage(d.message ?? d.error ?? "Ошибка поиска");
        return;
      }
      setVisible(d.candidates ?? []);
      setHidden(d.hidden ?? []);
      setGroups(d.groups ?? {});
      setHiddenCount(d.hiddenCount ?? 0);
      setQueriesUsed(d.queriesUsed ?? []);
      setMessage(`Показано: ${d.count ?? 0} · скрыто: ${d.hiddenCount ?? 0}`);
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  async function sendToImport() {
    const urls = [...selected];
    if (urls.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/catalogs/discover/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          categorySlug,
          city: cityLabel,
          searchQuery: queriesUsed.join(" | "),
          settlementId: location?.settlementId ?? null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        count?: number;
        errors?: { url: string; error: string }[];
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка");
        return;
      }
      setMessage(
        `Черновиков: ${d.count ?? 0}${d.errors?.length ? `, ошибок: ${d.errors.length}` : ""}. `,
      );
      window.location.href = "/admin/catalogs/import/drafts";
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  function toggleUrl(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold">Поиск источников</h2>
        <p className="mt-1 text-sm text-black/55">
          Запрос расширяется вариантами с городом. Результаты ранжируются по релевантности региона.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-black/60">Ключевые слова</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="авторазборка"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
          <div className="sm:col-span-2">
            <SettlementLocationField
              value={location}
              onChange={setLocation}
              onPersist={persistCatalogDiscoverLocation}
              required
              label="Город / регион"
              placeholder="Ижевск"
            />
          </div>
          <label className="block text-sm">
            <span className="text-black/60">Категория</span>
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            >
              {CATALOG_CATEGORY_SEED.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          disabled={busy || !query.trim() || !cityLabel}
          onClick={() => void runSearch()}
          className="mt-4 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Поиск…" : "Найти кандидатов"}
        </button>

        {queriesUsed.length > 0 ?
          <details className="mt-3 text-xs text-black/45">
            <summary className="cursor-pointer">Запросы к API ({queriesUsed.length})</summary>
            <ul className="mt-1 list-inside list-disc">
              {queriesUsed.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
        : null}

        {message ?
          <p className="mt-3 text-sm font-medium text-black/70">{message}</p>
        : null}

        {hiddenCount > 0 ?
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-black/55">Скрыто нерелевантных источников: {hiddenCount}</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
              />
              Показать скрытые
            </label>
          </div>
        : null}
      </section>

      {Object.keys(displayGroups).length > 0 ?
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Кандидаты</h2>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void sendToImport()}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                В импорт ({selected.size})
              </button>
              <Link
                href="/admin/catalogs/import/drafts"
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium"
              >
                Черновики
              </Link>
            </div>
          </div>

          {Object.entries(displayGroups)
            .sort(([, a], [, b]) => (b[0]?.relevanceScore ?? 0) - (a[0]?.relevanceScore ?? 0))
            .map(([domain, items]) => (
              <div key={domain} className="rounded-2xl border border-black/10 bg-white p-4">
                <h3 className="font-semibold">{domain}</h3>
                <ul className="mt-2 space-y-3">
                  {items
                    .sort((a, b) => b.relevanceScore - a.relevanceScore)
                    .map((c) => (
                      <li key={c.url} className="flex gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(c.url)}
                          disabled={c.hidden && !showHidden}
                          onChange={() => toggleUrl(c.url)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-black">{c.title || c.url}</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                              {c.relevanceScore}
                            </span>
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-900">
                              {DISCOVERY_SOURCE_LABEL[c.discoverySourceType as DiscoverySourceType] ??
                                c.discoverySourceType}
                            </span>
                            {c.hidden ?
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
                                скрыт
                              </span>
                            : null}
                          </div>
                          <p className="line-clamp-2 text-black/55">{c.snippet}</p>
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block truncate text-xs underline text-black/45"
                          >
                            {c.url}
                          </a>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </section>
      : null}
    </div>
  );
}
