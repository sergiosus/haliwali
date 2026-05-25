"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettlementLocationField } from "../../components/location/SettlementLocationField";
import { DISCOVERY_SOURCE_LABEL, type DiscoverySourceType } from "../../lib/catalogDiscoverSourceType";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../lib/catalogDiscoverLocationStorage";
import type { CatalogImportCandidateHistoryItem, CatalogImportCandidateSession } from "../../lib/catalogImportCandidateTypes";
import { isLikelyBadCompanyName } from "../../lib/catalogCompanyNameExtract";
import {
  IMPORT_CANDIDATE_STATE_LABEL,
  syncSelectedStates,
  type PersistedImportCandidate,
} from "../../lib/catalogImportCandidateTypes";
import { CATALOG_CATEGORY_SEED } from "../../lib/catalogTypes";

function visibleCandidates(candidates: PersistedImportCandidate[], showHidden: boolean): PersistedImportCandidate[] {
  return candidates.filter((c) => showHidden || !c.hidden);
}

function groupByDomain(list: PersistedImportCandidate[]): Record<string, PersistedImportCandidate[]> {
  return list.reduce<Record<string, PersistedImportCandidate[]>>((acc, c) => {
    if (!acc[c.domain]) acc[c.domain] = [];
    acc[c.domain]!.push(c);
    return acc;
  }, {});
}

function stateBadgeClass(state: PersistedImportCandidate["state"]): string {
  switch (state) {
    case "selected":
      return "bg-blue-50 text-blue-900";
    case "imported":
      return "bg-emerald-50 text-emerald-900";
    case "rejected":
      return "bg-amber-50 text-amber-900";
    case "removed":
      return "bg-red-50 text-red-800";
    default:
      return "bg-black/[0.06] text-black/60";
  }
}

export function AdminCatalogImportCandidatesSection({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<CatalogDiscoverLocation | null>(null);
  const [categorySlug, setCategorySlug] = useState("auto");
  const [session, setSession] = useState<CatalogImportCandidateSession | null>(null);
  const [history, setHistory] = useState<CatalogImportCandidateHistoryItem[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);

  useEffect(() => {
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, []);

  const loadHistory = useCallback(() => {
    void fetch("/api/admin/catalogs/import/history", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { history?: CatalogImportCandidateHistoryItem[] }) => setHistory(d.history ?? []))
      .catch(() => setHistory([]));
  }, []);

  const loadSession = useCallback((id?: number) => {
    const url =
      id ?
        `/api/admin/catalogs/import/candidates?id=${id}`
      : "/api/admin/catalogs/import/candidates";
    return fetch(url, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { session?: CatalogImportCandidateSession | null }) => {
        const s = d.session ?? null;
        if (s) {
          setSession(s);
          setQuery(s.query);
          setCategorySlug(s.categorySlug || "auto");
          setQueriesUsed(s.queriesUsed);
          if (s.city) {
            setLocation((prev) => ({
              city: s.city,
              region: prev?.region ?? "",
              displayName: s.city,
              address: prev?.address,
              latitude: prev?.latitude,
              longitude: prev?.longitude,
              source: prev?.source ?? "suggestion",
              settlementId: prev?.settlementId ?? null,
            }));
          }
        }
        return s;
      });
  }, []);

  useEffect(() => {
    void loadSession().then((s) => {
      if (s) setMessage(`Загружен черновик: ${s.candidates.length} кандидатов`);
    });
    loadHistory();
  }, [loadSession, loadHistory]);

  const cityLabel = catalogDiscoverCityLabel(location);
  const candidates = session?.candidates ?? [];
  const list = visibleCandidates(candidates, showHidden);
  const displayGroups = groupByDomain(list);
  const hiddenCount = candidates.filter((c) => c.hidden).length;

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.state === "selected").length,
    [candidates],
  );

  const selectableUrls = useMemo(
    () => list.filter((c) => c.state !== "imported" && c.state !== "removed").map((c) => c.url),
    [list],
  );

  async function persistCandidates(next: PersistedImportCandidate[]) {
    if (!session) return;
    const r = await fetch("/api/admin/catalogs/import/candidates", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, candidates: next }),
    });
    const d = (await r.json()) as { session?: CatalogImportCandidateSession };
    if (d.session) setSession(d.session);
  }

  async function runSearch() {
    setBusy(true);
    setMessage(null);
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
        session?: CatalogImportCandidateSession;
        count?: number;
        hiddenCount?: number;
        queriesUsed?: string[];
      };
      if (!r.ok) {
        setMessage(d.message ?? d.error ?? "Ошибка поиска");
        return;
      }
      if (d.session) setSession(d.session);
      setQueriesUsed(d.queriesUsed ?? []);
      setMessage(`Показано: ${d.count ?? 0} · скрыто: ${d.hiddenCount ?? 0}`);
      loadHistory();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  async function sendToImport() {
    const urls = candidates.filter((c) => c.state === "selected").map((c) => c.url);
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
          searchQuery: queriesUsed.join(" | ") || query,
          sessionId: session?.id,
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
        session?: CatalogImportCandidateSession;
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка");
        return;
      }
      if (d.session) setSession(d.session);
      setMessage(
        `Импортировано черновиков: ${d.count ?? 0}${d.errors?.length ? `, ошибок: ${d.errors.length}` : ""}. Список сохранён.`,
      );
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  function setSelection(urls: string[], selected: boolean) {
    if (!session) return;
    const set = new Set(urls);
    const next = candidates.map((c) => {
      if (!set.has(c.url)) return c;
      if (c.state === "imported" || c.state === "rejected" || c.state === "removed") return c;
      return { ...c, state: selected ? ("selected" as const) : ("found" as const) };
    });
    setSession({ ...session, candidates: next });
    void persistCandidates(next);
  }

  function toggleUrl(url: string) {
    const c = candidates.find((x) => x.url === url);
    if (!c || c.state === "imported") return;
    setSelection([url], c.state !== "selected");
  }

  function selectAll() {
    setSelection(selectableUrls, true);
  }

  function clearSelection() {
    const synced = syncSelectedStates(candidates, new Set());
    if (!session) return;
    setSession({ ...session, candidates: synced });
    void persistCandidates(synced);
  }

  async function restoreHistoryItem(id: number) {
    setBusy(true);
    try {
      await loadSession(id);
      setMessage("Восстановлен сохранённый список");
      loadHistory();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-8"}>
      <section className="rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold">Поиск источников</h2>
        {!compact ?
          <p className="mt-1 text-sm text-black/55">
            Результаты сохраняются в черновик импорта (переживают перезагрузку и «В импорт»).
          </p>
        : null}

        {history.length > 0 ?
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="w-full text-xs font-medium text-black/45">Последние поиски:</span>
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={busy}
                onClick={() => void restoreHistoryItem(h.id)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  session?.id === h.id ?
                    "border-black/20 bg-black/[0.06] text-black"
                  : "border-black/10 text-black/55 hover:border-black/20 hover:text-black",
                ].join(" ")}
                title={`${h.city} · ${h.candidateCount} кандидатов`}
              >
                {h.query.slice(0, 48)}
                {h.query.length > 48 ? "…" : ""}
              </button>
            ))}
          </div>
        : null}

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

        {message ?
          <p className="mt-3 text-sm font-medium text-black/70">{message}</p>
        : null}

        {hiddenCount > 0 ?
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-black/55">Скрыто нерелевантных: {hiddenCount}</span>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || selectableUrls.length === 0}
                onClick={selectAll}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
              >
                Выбрать все
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clearSelection}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
              >
                Снять выбор
              </button>
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={() => void sendToImport()}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                В импорт ({selectedCount})
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
                          checked={c.state === "selected" || c.state === "imported"}
                          disabled={c.state === "imported" || (c.hidden && !showHidden)}
                          onChange={() => toggleUrl(c.url)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-black">{c.title || c.url}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateBadgeClass(c.state)}`}
                            >
                              {IMPORT_CANDIDATE_STATE_LABEL[c.state]}
                            </span>
                            {c.state === "imported" || isLikelyBadCompanyName(c.title) ?
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                                Можно редактировать
                              </span>
                            : null}
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
      : session ?
        <p className="text-sm text-black/50">Нет видимых кандидатов. Включите «Показать скрытые» или выполните поиск.</p>
      : null}
    </div>
  );
}
