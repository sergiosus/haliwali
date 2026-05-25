"use client";

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
  IMPORT_CANDIDATE_RESULT_LABEL,
  IMPORT_CANDIDATE_STATE_LABEL,
  syncSelectedStates,
  type ImportCandidateResultStatus,
  type PersistedImportCandidate,
} from "../../lib/catalogImportCandidateTypes";
import { CATALOG_CATEGORY_SEED } from "../../lib/catalogTypes";

const IMPORT_CANDIDATES_STATE_KEY = "haliwali_admin_import_candidates_state_v1";
const RECENT_KEYWORDS_KEY = "haliwali_admin_import_recent_keywords";
const MAX_RECENT_KEYWORDS = 10;

type ImportResultFilter = "all" | "imported" | "duplicates" | "errors" | "skipped";

type StoredImportCandidatesState = {
  query: string;
  location: CatalogDiscoverLocation | null;
  categorySlug: string;
  session: CatalogImportCandidateSession | null;
  showHidden: boolean;
  resultFilter: ImportResultFilter;
  queriesUsed: string[];
};

function visibleCandidates(candidates: PersistedImportCandidate[], showHidden: boolean): PersistedImportCandidate[] {
  return candidates.filter((c) => showHidden || !c.hidden || c.importStatus);
}

function filteredCandidates(
  candidates: PersistedImportCandidate[],
  showHidden: boolean,
  filter: ImportResultFilter,
): PersistedImportCandidate[] {
  return visibleCandidates(candidates, showHidden).filter((c) => resultFilterMatch(c, filter));
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

function resultBadgeClass(status: ImportCandidateResultStatus): string {
  switch (status) {
    case "imported":
      return "bg-emerald-50 text-emerald-900";
    case "skipped_duplicate":
      return "bg-blue-50 text-blue-900";
    case "failed":
      return "bg-red-50 text-red-800";
    case "skipped_hidden":
    case "skipped_invalid":
      return "bg-amber-50 text-amber-900";
    default:
      return "bg-black/[0.06] text-black/60";
  }
}

function resultFilterMatch(c: PersistedImportCandidate, filter: ImportResultFilter): boolean {
  if (filter === "all") return true;
  if (filter === "imported") return c.importStatus === "imported";
  if (filter === "duplicates") return c.importStatus === "skipped_duplicate";
  if (filter === "errors") return c.importStatus === "failed";
  return c.importStatus === "skipped_invalid" || c.importStatus === "skipped_hidden";
}

function resultState(status: ImportCandidateResultStatus): PersistedImportCandidate["state"] {
  if (status === "imported") return "imported";
  if (status === "skipped_hidden") return "removed";
  return "rejected";
}

function readStoredImportCandidatesState(): StoredImportCandidatesState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IMPORT_CANDIDATES_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImportCandidatesState;
    return {
      query: String(parsed.query ?? ""),
      location: parsed.location ?? null,
      categorySlug: String(parsed.categorySlug ?? "auto"),
      session: parsed.session ?? null,
      showHidden: Boolean(parsed.showHidden),
      resultFilter: parsed.resultFilter ?? "all",
      queriesUsed: Array.isArray(parsed.queriesUsed) ? parsed.queriesUsed.map(String) : [],
    };
  } catch {
    return null;
  }
}

function writeStoredImportCandidatesState(state: StoredImportCandidatesState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMPORT_CANDIDATES_STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function readRecentKeywords(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEYWORDS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, MAX_RECENT_KEYWORDS);
  } catch {
    return [];
  }
}

function writeRecentKeywords(keywords: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(keywords.slice(0, MAX_RECENT_KEYWORDS)));
  } catch {
    /* quota */
  }
}

function addRecentKeyword(keywords: string[], keyword: string): string[] {
  const normalized = keyword.trim();
  if (!normalized) return keywords;
  const deduped = keywords.filter((item) => item.trim().toLowerCase() !== normalized.toLowerCase());
  return [normalized, ...deduped].slice(0, MAX_RECENT_KEYWORDS);
}

function openDraftsInNewTab() {
  window.open("/admin/catalogs/import/drafts", "_blank", "noopener,noreferrer");
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
  const [resultFilter, setResultFilter] = useState<ImportResultFilter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [recentKeywords, setRecentKeywords] = useState<string[]>([]);
  const [keywordFocused, setKeywordFocused] = useState(false);
  const [initialSessionId, setInitialSessionId] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    setRecentKeywords(readRecentKeywords());

    const stored = readStoredImportCandidatesState();
    if (stored) {
      setQuery(stored.query);
      setLocation(stored.location);
      setCategorySlug(stored.categorySlug || "auto");
      setSession(stored.session);
      setShowHidden(stored.showHidden);
      setResultFilter(stored.resultFilter);
      setQueriesUsed(stored.queriesUsed);
      setInitialSessionId(stored.session?.id && stored.session.id > 0 ? stored.session.id : null);
      return;
    }

    const savedLocation = readCatalogDiscoverLocation();
    if (savedLocation) setLocation(savedLocation);
    setInitialSessionId(null);
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
    if (initialSessionId === undefined) return;
    void loadSession(initialSessionId ?? undefined).then((s) => {
      if (s) setMessage(`Загружен черновик: ${s.candidates.length} кандидатов`);
    });
    loadHistory();
  }, [initialSessionId, loadSession, loadHistory]);

  const cityLabel = catalogDiscoverCityLabel(location);
  const candidates = session?.candidates ?? [];

  useEffect(() => {
    if (initialSessionId === undefined) return;
    writeStoredImportCandidatesState({
      query,
      location,
      categorySlug,
      session,
      showHidden,
      resultFilter,
      queriesUsed,
    });
  }, [initialSessionId, query, location, categorySlug, session, showHidden, resultFilter, queriesUsed]);

  const resultCounts = useMemo(() => {
    const imported = candidates.filter((c) => c.importStatus === "imported").length;
    const duplicates = candidates.filter((c) => c.importStatus === "skipped_duplicate").length;
    const errors = candidates.filter((c) => c.importStatus === "failed").length;
    const skipped = candidates.filter(
      (c) => c.importStatus === "skipped_invalid" || c.importStatus === "skipped_hidden",
    ).length;
    return { all: candidates.length, imported, duplicates, errors, skipped };
  }, [candidates]);
  const hasImportResults =
    resultCounts.imported + resultCounts.duplicates + resultCounts.errors + resultCounts.skipped > 0;
  const filteredCandidatesList = filteredCandidates(candidates, showHidden, resultFilter);
  const displayGroups = groupByDomain(filteredCandidatesList);
  const hiddenCount = candidates.filter((c) => c.hidden).length;

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.state === "selected").length,
    [candidates],
  );

  const selectableUrls = useMemo(
    () =>
      filteredCandidatesList
        .filter((c) => !c.importStatus && c.state !== "imported" && c.state !== "removed")
        .map((c) => c.url),
    [filteredCandidatesList],
  );
  const recentKeywordSuggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recentKeywords;
    const matches = recentKeywords.filter((item) => item.toLowerCase().includes(needle));
    return matches.length > 0 ? matches : recentKeywords;
  }, [query, recentKeywords]);
  const showRecentKeywordDropdown = keywordFocused && recentKeywordSuggestions.length > 0;

  function selectRecentKeyword(keyword: string) {
    setQuery(keyword);
    setKeywordFocused(false);
  }

  function clearRecentKeywords() {
    setRecentKeywords([]);
    writeRecentKeywords([]);
  }

  async function persistCandidates(next: PersistedImportCandidate[]) {
    if (!session || session.id < 1) return;
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
        candidates?: Omit<PersistedImportCandidate, "state">[];
        hidden?: Omit<PersistedImportCandidate, "state">[];
        count?: number;
        hiddenCount?: number;
        queriesUsed?: string[];
      };
      if (!r.ok) {
        setMessage(d.message ?? d.error ?? "Ошибка поиска");
        return;
      }
      const nextSession =
        d.session ??
        {
          id: 0,
          query,
          city: cityLabel,
          categorySlug,
          queriesUsed: d.queriesUsed ?? [],
          candidates: [
            ...(d.candidates ?? []).map((c) => ({ ...c, state: "found" as const })),
            ...(d.hidden ?? []).map((c) => ({ ...c, state: "found" as const })),
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      setSession(nextSession);
      setResultFilter("all");
      setQueriesUsed(d.queriesUsed ?? []);
      const nextKeywords = addRecentKeyword(recentKeywords, query);
      setRecentKeywords(nextKeywords);
      writeRecentKeywords(nextKeywords);
      const nextHiddenCount = nextSession.candidates.filter((c) => c.hidden).length;
      const nextShownCount = filteredCandidates(nextSession.candidates, showHidden, "all").length;
      setMessage(`Показано: ${nextShownCount} · скрыто: ${nextHiddenCount}`);
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
        summary?: { imported: number; duplicates: number; errors: number; skipped: number };
        results?: {
          url: string;
          status: ImportCandidateResultStatus;
          reason?: string | null;
          draftId?: number | null;
          duplicateOfCompanyId?: number | null;
          duplicateName?: string | null;
          duplicateHref?: string | null;
        }[];
        errors?: { url: string; error: string }[];
        session?: CatalogImportCandidateSession;
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка");
        return;
      }
      if (d.session) {
        setSession(d.session);
      } else if (d.results && session) {
        const byUrl = new Map(d.results.map((res) => [res.url.trim(), res]));
        setSession({
          ...session,
          candidates: candidates.map((c) => {
            const result = byUrl.get(c.url.trim());
            if (!result) return c;
            return {
              ...c,
              state: resultState(result.status),
              importStatus: result.status,
              importReason: result.reason ?? null,
              draftId: result.draftId ?? c.draftId ?? null,
              duplicateOfCompanyId: result.duplicateOfCompanyId ?? c.duplicateOfCompanyId ?? null,
              duplicateName: result.duplicateName ?? c.duplicateName ?? null,
              duplicateHref: result.duplicateHref ?? c.duplicateHref ?? null,
            };
          }),
        });
      }
      const summary = d.summary ?? { imported: d.count ?? 0, duplicates: 0, errors: d.errors?.length ?? 0, skipped: 0 };
      setMessage(
        `Импортировано: ${summary.imported} · Дубликаты: ${summary.duplicates} · Ошибки: ${summary.errors} · Пропущено: ${summary.skipped}`,
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
    if (!c || c.importStatus || c.state === "imported") return;
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

  function removeSelected() {
    if (!session || selectedCount === 0) return;
    const next = candidates.map((c) =>
      c.state === "selected" ? { ...c, state: "removed" as const } : c,
    );
    setSession({ ...session, candidates: next });
    void persistCandidates(next);
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
    <div className={compact ? "w-full min-w-0 space-y-4 overflow-visible" : "w-full min-w-0 space-y-8 overflow-visible"}>
      <section className="w-full min-w-0 overflow-visible rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
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
          <div className="relative block text-sm sm:col-span-2">
            <span className="text-black/60">Ключевые слова</span>
            <input
              value={query}
              onFocus={() => setKeywordFocused(true)}
              onBlur={() => setKeywordFocused(false)}
              onChange={(e) => {
                setQuery(e.target.value);
                setKeywordFocused(true);
              }}
              placeholder="авторазборка"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
            {showRecentKeywordDropdown ?
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
                <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2">
                  <span className="text-xs font-medium text-black/45">Недавние запросы</span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      clearRecentKeywords();
                    }}
                    className="rounded-full px-2 py-0.5 text-xs text-black/45 hover:bg-black/[0.04] hover:text-black"
                    aria-label="Очистить историю ключевых слов"
                    title="Очистить историю"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {recentKeywordSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectRecentKeyword(item);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-black/75 hover:bg-black/[0.04]"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            : null}
          </div>
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

      {filteredCandidatesList.length > 0 ?
        <section className="w-full min-w-0 space-y-3 overflow-visible sm:space-y-4">
          {hasImportResults ?
            <div className="rounded-2xl border border-black/10 bg-white p-3 text-sm">
              <p className="font-medium text-black/70">
                Импортировано: {resultCounts.imported} · Дубликаты: {resultCounts.duplicates} · Ошибки:{" "}
                {resultCounts.errors} · Пропущено: {resultCounts.skipped}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { id: "all" as const, label: "Все", count: resultCounts.all },
                  { id: "imported" as const, label: "Импортированные", count: resultCounts.imported },
                  { id: "duplicates" as const, label: "Дубликаты", count: resultCounts.duplicates },
                  { id: "errors" as const, label: "Ошибки", count: resultCounts.errors },
                  { id: "skipped" as const, label: "Пропущенные", count: resultCounts.skipped },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setResultFilter(f.id)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      resultFilter === f.id ?
                        "border-black/20 bg-black/[0.06] text-black"
                      : "border-black/10 bg-white text-black/55 hover:text-black/75",
                    ].join(" ")}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            </div>
          : null}

          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Кандидаты</h2>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <button
                type="button"
                disabled={busy || selectableUrls.length === 0}
                onClick={selectAll}
                className="inline-flex w-full items-center justify-center rounded-full border border-black/15 px-3 py-2 text-xs font-medium sm:w-auto sm:py-1.5"
              >
                Выбрать все
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clearSelection}
                className="inline-flex w-full items-center justify-center rounded-full border border-black/15 px-3 py-2 text-xs font-medium sm:w-auto sm:py-1.5"
              >
                Снять выбор
              </button>
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={() => void sendToImport()}
                className="inline-flex w-full items-center justify-center rounded-full bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 sm:w-auto sm:text-sm"
              >
                Импортировать выбранные ({selectedCount})
              </button>
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={removeSelected}
                className="inline-flex w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 disabled:opacity-40 sm:w-auto"
              >
                Удалить выбранные
              </button>
              <button
                type="button"
                onClick={openDraftsInNewTab}
                className="col-span-2 inline-flex w-full items-center justify-center rounded-full border border-black/15 px-4 py-2 text-sm font-medium sm:col-span-1 sm:w-auto"
              >
                Открыть черновики
              </button>
            </div>
          </div>

          {Object.keys(displayGroups).length > 0 ?
            Object.entries(displayGroups)
              .sort(([, a], [, b]) => (b[0]?.relevanceScore ?? 0) - (a[0]?.relevanceScore ?? 0))
              .map(([domain, items]) => (
              <div key={domain} className="w-full min-w-0 overflow-visible rounded-2xl border border-black/10 bg-white p-3 sm:p-4">
                <h3 className="font-semibold">{domain}</h3>
                <ul className="mt-2 space-y-3">
                  {items
                    .sort((a, b) => b.relevanceScore - a.relevanceScore)
                    .map((c) => (
                      <li key={c.url} className="flex w-full min-w-0 items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={c.state === "selected" || c.state === "imported"}
                          disabled={
                            Boolean(c.importStatus) ||
                            c.state === "imported" ||
                            c.state === "removed" ||
                            (c.hidden && !showHidden)
                          }
                          onChange={() => toggleUrl(c.url)}
                          className="mt-1 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words font-medium text-black">{c.title || c.url}</span>
                            {c.importStatus ?
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultBadgeClass(c.importStatus)}`}
                              >
                                {IMPORT_CANDIDATE_RESULT_LABEL[c.importStatus]}
                              </span>
                            : <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateBadgeClass(c.state)}`}
                              >
                                {IMPORT_CANDIDATE_STATE_LABEL[c.state]}
                              </span>
                            }
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
                          {c.importStatus === "skipped_duplicate" && (c.duplicateName || c.duplicateHref) ?
                            <p className="mt-1 text-xs text-blue-900/80">
                              Дубликат:{" "}
                              {c.duplicateHref ?
                                <a
                                  href={c.duplicateHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium underline"
                                >
                                  {c.duplicateName ?? c.duplicateHref}
                                </a>
                              : <span className="font-medium">{c.duplicateName}</span>}
                            </p>
                          : null}
                          {c.importStatus && c.importReason ?
                            <p className="mt-1 text-xs text-black/40">Причина: {c.importReason}</p>
                          : null}
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block min-w-0 break-all text-xs underline text-black/45 sm:truncate"
                          >
                            {c.url}
                          </a>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          : <p className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/50">
              Нет кандидатов в выбранном фильтре
            </p>}
        </section>
      : session ?
        <p className="text-sm text-black/50">Нет видимых кандидатов. Включите «Показать скрытые» или выполните поиск.</p>
      : null}
    </div>
  );
}
