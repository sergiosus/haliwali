"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SettlementLocationField } from "../../../components/location/SettlementLocationField";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../../lib/catalogDiscoverLocationStorage";
import { catalogSourceNameLabel } from "../../../lib/catalogSourceName";
import type {
  OfferSearchResultItem,
  OfferSearchStats,
} from "../../../lib/catalogOfferAdminSearch";
import type { OfferSearchApiErrorDetail } from "../../../lib/catalogOfferSearchApiError";
import {
  clearOfferSearchFiltersInStorage,
  clearOfferSearchHistory,
  clearOfferSearchResultsInStorage,
  pushOfferSearchHistory,
  readOfferSearchHistory,
  readOfferSearchState,
  removeOfferSearchHistoryItem,
  writeOfferSearchState,
  type OfferSearchPageSize,
  type PersistedOfferSearchState,
} from "../../../lib/offerSearchLocalStorage";
import type { SourceOfferImportError } from "../../../lib/catalogSourceOfferImportErrors";
import { SOURCE_OFFER_IMPORT_ERROR_LABELS } from "../../../lib/catalogSourceOfferImportErrors";
import {
  OfferImportGoToDraftsBanner,
  OFFER_SOURCE_OPTIONS,
  type OfferSourceFilter,
} from "./offerImportUi";
import { OfferSearchQueryAutocomplete } from "./OfferSearchQueryAutocomplete";

type OfferSourceSearchDiagnostic = OfferSearchStats["diagnostics"][number];

const SOURCE_DIAG_LABEL: Record<string, string> = {
  avito: "Avito",
  drom: "Drom",
  youla: "Youla",
  vk: "VK",
};

const HIDDEN_REASON_LABEL: Record<string, string> = {
  city_mismatch: "город",
  price_filter: "цена",
  brand_oem: "бренд / OEM",
  duplicate: "дубликат",
  bad_encoding: "битая кодировка",
  not_listing: "не объявление",
  insufficient_fields: "мало полей",
  generic_title: "общий заголовок",
  query_mismatch: "не совпадает с запросом",
  cap: "лимит 100",
};

const PARSE_QUALITY_LABEL: Record<string, string> = {
  link_only: "ссылка с поиска",
};

const OFFER_SOURCE_ZERO_LABELS: Record<string, string> = {
  blocked: "Avito blocked search page.",
  captcha: "капча / антибот",
  no_selector: "ссылки на объявления в HTML не найдены",
  empty_response: "пустой ответ",
  fetch_error: "ошибка загрузки",
  parse_error: "ошибка разбора HTML",
  unsupported: "источник не поддерживается",
  city_unsupported: "город не в URL — ищем широко, фильтр после разбора",
  catalog_only: "Drom returned catalog pages, no real offers.",
  js_shell: "Drom: объявления подгружаются скриптом, ссылок в HTML нет.",
};

const DEFAULT_CATEGORY = "drugie";

const EMPTY_REASON_LABEL: Record<string, string> = {
  EMPTY_QUERY: "Введите поисковый запрос",
  UNSUPPORTED_SOURCE: "Для этого источника используйте «По ссылкам»",
  NO_LINKS_EXTRACTED: "На страницах поиска площадок не найдено ссылок на объявления",
  ALL_FILTERED_NOT_LISTING: "Все ссылки отфильтрованы: не объявления",
  ALL_FILTERED_SOURCE: "Нет результатов для выбранного источника",
  ALL_FILTERED_BRAND_OEM: "Нет совпадений по бренду или OEM/артикулу",
  ALL_FILTERED_PRICE: "Нет результатов в диапазоне цен",
  ALL_FILTERED_CITY: "Все ссылки отфильтрованы по городу",
  SOURCE_BLOCKED: "Площадки заблокировали загрузку (капча / 403)",
};

function locationFromCity(city: string): CatalogDiscoverLocation | null {
  const c = city.trim();
  if (!c) return null;
  return {
    city: c,
    region: "",
    displayName: c,
    source: "suggestion",
    settlementId: null,
  };
}

function buildPersistedState(args: {
  query: string;
  cityLabel: string;
  sourceFilter: OfferSourceFilter;
  priceMin: string;
  priceMax: string;
  brand: string;
  oemArticle: string;
  page: number;
  pageSize: OfferSearchPageSize;
  results: OfferSearchResultItem[];
  skippedResults: OfferSearchResultItem[];
  selected: Set<string>;
  searchStats: OfferSearchStats | null;
  message: string | null;
  emptyReason: string | null;
  searched: boolean;
}): PersistedOfferSearchState {
  return {
    query: args.query,
    city: args.cityLabel,
    source: args.sourceFilter,
    priceFrom: args.priceMin,
    priceTo: args.priceMax,
    brand: args.brand,
    oem: args.oemArticle,
    page: args.page,
    perPage: args.pageSize,
    results: args.results,
    skipped: args.skippedResults,
    selectedIds: [...args.selected],
    stats: args.searchStats,
    message: args.message,
    emptyReason: args.emptyReason,
    searched: args.searched,
    timestamp: Date.now(),
  };
}

/** Offer web search — dedicated API, no company import sessions. */
export function AdminCatalogOfferSearchImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<CatalogDiscoverLocation | null>(null);
  const [sourceFilter, setSourceFilter] = useState<OfferSourceFilter>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [brand, setBrand] = useState("");
  const [oemArticle, setOemArticle] = useState("");
  const [results, setResults] = useState<OfferSearchResultItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [importErrors, setImportErrors] = useState<SourceOfferImportError[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<OfferSearchPageSize>(20);
  const [searched, setSearched] = useState(false);
  const [searchStats, setSearchStats] = useState<OfferSearchStats | null>(null);
  const [diagnostics, setDiagnostics] = useState<OfferSourceSearchDiagnostic[]>([]);
  const [skippedResults, setSkippedResults] = useState<OfferSearchResultItem[]>([]);
  const [searchError, setSearchError] = useState<OfferSearchApiErrorDetail | null>(null);
  const [lastHttpStatus, setLastHttpStatus] = useState<number | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cityLabel = catalogDiscoverCityLabel(location);

  const persistNow = useCallback(
    (overrides?: Partial<Parameters<typeof buildPersistedState>[0]>) => {
      const state = buildPersistedState({
        query,
        cityLabel,
        sourceFilter,
        priceMin,
        priceMax,
        brand,
        oemArticle,
        page,
        pageSize,
        results,
        skippedResults,
        selected,
        searchStats,
        message,
        emptyReason,
        searched,
        ...overrides,
      });
      writeOfferSearchState(state);
    },
    [
      query,
      cityLabel,
      sourceFilter,
      priceMin,
      priceMax,
      brand,
      oemArticle,
      page,
      pageSize,
      results,
      skippedResults,
      selected,
      searchStats,
      message,
      emptyReason,
      searched,
    ],
  );

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => persistNow(), 250);
  }, [persistNow]);

  const applyPersistedState = useCallback((s: PersistedOfferSearchState) => {
    setQuery(s.query);
    setLocation(s.city ? locationFromCity(s.city) : null);
    setSourceFilter(s.source);
    setPriceMin(s.priceFrom);
    setPriceMax(s.priceTo);
    setBrand(s.brand);
    setOemArticle(s.oem);
    setPage(s.page);
    setPageSize(s.perPage);
    setResults(s.results);
    setSkippedResults(s.skipped);
    setSelected(new Set(s.selectedIds));
    setSearchStats(s.stats);
    setDiagnostics(s.stats?.diagnostics ?? []);
    setMessage(s.message);
    setEmptyReason(s.emptyReason);
    setSearched(s.searched);
  }, []);

  useEffect(() => {
    setSearchHistory(readOfferSearchHistory());
    const local = readOfferSearchState();
    if (local) applyPersistedState(local);
    setRestored(true);
  }, [applyPersistedState]);

  useEffect(() => {
    if (!restored) return;
    const saved = readCatalogDiscoverLocation();
    if (saved && !location) setLocation(saved);
  }, [restored, location]);

  useEffect(() => {
    if (!restored) return;
    schedulePersist();
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    restored,
    schedulePersist,
    query,
    cityLabel,
    sourceFilter,
    priceMin,
    priceMax,
    brand,
    oemArticle,
    page,
    pageSize,
    results,
    skippedResults,
    selected,
    searchStats,
    message,
    emptyReason,
    searched,
  ]);

  const totalFound = results.length;
  const hiddenCount = skippedResults.length;
  const totalPages = Math.max(1, Math.ceil(totalFound / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageResults = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return results.slice(start, start + pageSize);
  }, [results, safePage, pageSize]);
  const displayedCount = pageResults.length;
  const selectedCount = selected.size;

  const focusResults = useCallback(() => {
    requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    setEmptyReason(null);
    setSearchError(null);
    setLastHttpStatus(null);
    setCreatedCount(0);
    setImportErrors([]);
    try {
      const r = await fetch("/api/admin/catalogs/source-offers/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          city: cityLabel,
          brand: brand.trim(),
          oemArticle: oemArticle.trim(),
          source: sourceFilter,
          priceMin: priceMin.trim() ? Number(priceMin) : undefined,
          priceMax: priceMax.trim() ? Number(priceMax) : undefined,
        }),
      });
      setLastHttpStatus(r.status);
      const rawBody = await r.text();
      let d: {
        ok?: boolean;
        error?: string;
        message?: string;
        emptyReason?: string | null;
        results?: OfferSearchResultItem[];
        skipped?: OfferSearchResultItem[];
        stats?: OfferSearchStats;
        searchError?: OfferSearchApiErrorDetail;
      };
      try {
        d = JSON.parse(rawBody) as typeof d;
      } catch (parseErr) {
        const parseMessage =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        const errDetail: OfferSearchApiErrorDetail = {
          message: `Ответ сервера не JSON (HTTP ${r.status}): ${parseMessage}`,
          httpStatus: r.status,
          requestUrl: "/api/admin/catalogs/source-offers/search",
        };
        setSearchError(errDetail);
        setMessage(errDetail.message);
        setEmptyReason("INVALID_RESPONSE");
        setSearched(true);
        setPage(1);
        persistNow({
          results: [],
          skippedResults: [],
          searchStats: null,
          searched: true,
          page: 1,
          selected: new Set(),
        });
        return;
      }

      if (d.searchError) setSearchError(d.searchError);

      if (!r.ok || !d.ok) {
        const err = d.searchError;
        const detail =
          err?.message ?? d.message ?? d.error ?? `HTTP ${r.status}`;
        setMessage(detail);
        setEmptyReason(d.error ?? d.emptyReason ?? "SEARCH_FAILED");
        const list = d.results ?? [];
        setResults(list);
        setSkippedResults(d.skipped ?? []);
        setSearchStats(d.stats ?? null);
        setDiagnostics(d.stats?.diagnostics ?? []);
        setSearched(true);
        setPage(1);
        persistNow({
          results: list,
          skippedResults: d.skipped ?? [],
          searchStats: d.stats ?? null,
          message: detail,
          emptyReason: d.error ?? d.emptyReason ?? "SEARCH_FAILED",
          searched: true,
          page: 1,
        });
        focusResults();
        return;
      }

      const list = d.results ?? [];
      const skipped = d.skipped ?? [];
      setResults(list);
      setSkippedResults(skipped);
      setSearchStats(d.stats ?? null);
      setDiagnostics(d.stats?.diagnostics ?? []);
      setSearched(true);
      setPage(1);
      setEmptyReason(d.emptyReason ?? (list.length === 0 ? "NO_RESULTS" : null));
      const msg =
        list.length > 0 ?
          (d.message ?? null)
        : (d.message ??
          EMPTY_REASON_LABEL[d.emptyReason ?? ""] ??
          "Объявления не найдены");
      setMessage(msg);

      const hist = pushOfferSearchHistory(query.trim());
      setSearchHistory(hist);

      persistNow({
        results: list,
        skippedResults: skipped,
        searchStats: d.stats ?? null,
        message: msg,
        emptyReason: d.emptyReason ?? (list.length === 0 ? "NO_RESULTS" : null),
        searched: true,
        page: 1,
      });
      focusResults();
    } catch (transportErr) {
      const transportMessage =
        transportErr instanceof Error ? transportErr.message : String(transportErr);
      const errDetail: OfferSearchApiErrorDetail = {
        message: `Сбой запроса к API: ${transportMessage}`,
        requestUrl: "/api/admin/catalogs/source-offers/search",
      };
      setSearchError(errDetail);
      setMessage(errDetail.message);
      setEmptyReason("TRANSPORT_ERROR");
      setSearched(true);
      persistNow({ searched: true });
    } finally {
      setBusy(false);
    }
  }, [
    query,
    cityLabel,
    brand,
    oemArticle,
    sourceFilter,
    priceMin,
    priceMax,
    persistNow,
    focusResults,
  ]);

  const importSelected = useCallback(async () => {
    const urlSet = selected;
    if (urlSet.size === 0) return;
    const selections = results.filter((item) => urlSet.has(item.url));
    setBusy(true);
    setCreatedCount(0);
    setImportErrors([]);
    try {
      const r = await fetch("/api/admin/catalogs/source-offers/import-selections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorySlug: DEFAULT_CATEGORY,
          city: cityLabel,
          selections,
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        errors?: SourceOfferImportError[];
        sourceOfferDrafts?: unknown[];
        createdCount?: number;
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка импорта");
        return;
      }
      const offerCount = d.sourceOfferDrafts?.length ?? d.createdCount ?? 0;
      const errs = d.errors ?? [];
      setCreatedCount(offerCount);
      setImportErrors(errs);
      if (errs.length > 0) {
        setMessage(
          offerCount > 0 ?
            `Создано кандидатов: ${offerCount}. Не создано: ${errs.length} — см. список ниже.`
          : `Не создано ни одного кандидата (${errs.length}). См. причины ниже.`,
        );
      } else {
        setMessage(`Создано кандидатов предложений: ${offerCount}`);
      }
      persistNow();
      onChanged?.();
    } catch {
      setMessage("Ошибка сети при импорте");
    } finally {
      setBusy(false);
    }
  }, [selected, cityLabel, results, onChanged, persistNow]);

  const clearSearchFilters = useCallback(() => {
    setQuery("");
    setLocation(null);
    setSourceFilter("all");
    setPriceMin("");
    setPriceMax("");
    setBrand("");
    setOemArticle("");
    clearOfferSearchFiltersInStorage();
    persistNow({
      query: "",
      cityLabel: "",
      sourceFilter: "all",
      priceMin: "",
      priceMax: "",
      brand: "",
      oemArticle: "",
    });
  }, [persistNow]);

  const clearResultsOnly = useCallback(() => {
    setResults([]);
    setSkippedResults([]);
    setSearchStats(null);
    setDiagnostics([]);
    setSelected(new Set());
    setSearched(false);
    setMessage(null);
    setEmptyReason(null);
    setImportErrors([]);
    setCreatedCount(0);
    setPage(1);
    setSearchError(null);
    setLastHttpStatus(null);
    clearOfferSearchResultsInStorage();
  }, []);

  function toggleUrl(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of pageResults) next.add(item.url);
      return next;
    });
  }

  function setPageLocal(next: number) {
    const p = Math.max(1, Math.min(totalPages, next));
    setPage(p);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">По поисковому запросу</h3>
        <p className="mt-1 text-sm text-black/55">
          Прямой поиск на Avito, Drom, Youla, VK — без Google и Bing. Результаты и выбор хранятся в
          браузере (localStorage, 24 ч). Кандидаты — только в базе данных.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-black/60">Поисковый запрос</span>
        <OfferSearchQueryAutocomplete
          value={query}
          onChange={setQuery}
          onSubmit={() => void runSearch()}
          history={searchHistory}
          onRemoveHistoryItem={(item) => {
            setSearchHistory(removeOfferSearchHistoryItem(item));
          }}
          onClearHistory={() => {
            clearOfferSearchHistory();
            setSearchHistory([]);
          }}
          disabled={busy}
          placeholder="touran Ижевск · насос caterpillar 320 · iphone 12 Казань"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SettlementLocationField
            value={location}
            onChange={setLocation}
            onPersist={persistCatalogDiscoverLocation}
            label="Город / регион (необязательно)"
            placeholder="Ижевск"
          />
        </div>
        <label className="block text-sm">
          <span className="text-black/60">Источник</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as OfferSourceFilter)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          >
            {OFFER_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена от, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена до, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="100000"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Бренд</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">OEM / артикул</span>
          <input
            value={oemArticle}
            onChange={(e) => setOemArticle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !query.trim()}
          onClick={() => void runSearch()}
          className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Поиск…" : "Найти предложения"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={clearSearchFilters}
          className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          Очистить поиск
        </button>
        <button
          type="button"
          disabled={busy || (!searched && results.length === 0)}
          onClick={() => void clearResultsOnly()}
          className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          Очистить результаты
        </button>
      </div>

      <div ref={resultsSectionRef} tabIndex={-1} className="scroll-mt-4 outline-none">
        {searched ?
          <div className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3">
            <p className="text-base font-semibold text-black">
              <span className="text-black/55">Найдено:</span> {totalFound}
              <span className="mx-2 font-normal text-black/25">·</span>
              <span className="text-black/55">Показано:</span> {displayedCount}
              <span className="mx-2 font-normal text-black/25">·</span>
              <span className="text-black/55">Скрыто:</span> {hiddenCount}
              <span className="mx-2 font-normal text-black/25">·</span>
              <span className="text-black/55">Выбрано:</span> {selectedCount}
            </p>
            <p className="text-xs text-black/45">
              Страница {safePage} из {totalPages}
              {searchStats?.linksExtracted != null ?
                ` · с площадок извлечено: ${searchStats.linksExtracted}`
              : null}
            </p>
            {searchStats?.hidden && Object.keys(searchStats.hidden).length > 0 ?
              <p className="text-xs text-amber-900">
                <span className="font-medium">Фильтры:</span>{" "}
                {Object.entries(searchStats.hidden)
                  .map(([k, v]) => `${HIDDEN_REASON_LABEL[k] ?? k}: ${v}`)
                  .join(" · ")}
              </p>
            : null}
            {diagnostics.length > 0 ?
              <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
                <table className="w-full min-w-[32rem] text-left text-xs">
                  <thead className="border-b border-black/10 bg-black/[0.03] text-black/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Источник</th>
                      <th className="px-3 py-2 font-medium">Найдено</th>
                      <th className="px-3 py-2 font-medium">Релевантно</th>
                      <th className="px-3 py-2 font-medium">Отклонено</th>
                      <th className="px-3 py-2 font-medium">Ошибка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.map((diag) => {
                      const errText =
                        diag.errorMessage ??
                        (diag.linksExtracted === 0 ?
                          diag.message ??
                            OFFER_SOURCE_ZERO_LABELS[diag.zeroReason ?? ""] ??
                            diag.zeroReason ??
                            (diag.blocked ? "заблокирован" : null)
                        : null) ??
                        "—";
                      return (
                        <tr key={diag.sourceName} className="border-t border-black/5 align-top">
                          <td className="px-3 py-2 font-medium text-black">
                            {SOURCE_DIAG_LABEL[diag.sourceName] ?? diag.sourceName}
                          </td>
                          <td className="px-3 py-2">{diag.linksExtracted}</td>
                          <td className="px-3 py-2">{diag.relevantCount ?? "—"}</td>
                          <td className="px-3 py-2">{diag.rejectedByRelevance ?? "—"}</td>
                          <td className="px-3 py-2 text-amber-900">{errText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            : null}
          </div>
        : null}

        {searchError || lastHttpStatus != null ?
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-950">
            <p className="font-semibold">Ошибка поиска (детали)</p>
            {lastHttpStatus != null ?
              <p className="mt-1">
                <span className="font-medium">HTTP:</span> {lastHttpStatus}
              </p>
            : null}
            <p className="mt-1">
              <span className="font-medium">Сообщение:</span>{" "}
              {searchError?.message ?? message ?? "—"}
            </p>
          </div>
        : null}

        {message && !searchError ?
          <p className="mt-3 text-sm font-medium text-amber-900">{message}</p>
        : null}

        {importErrors.length > 0 ?
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm">
            <p className="font-semibold text-red-950">Не удалось создать кандидатов</p>
            <ul className="mt-2 space-y-2">
              {importErrors.map((err) => (
                <li key={err.url} className="rounded-xl border border-red-100 bg-white/80 p-3">
                  <p className="break-all font-medium text-black">{err.url}</p>
                  <p className="mt-1 text-red-900">
                    {err.message || SOURCE_OFFER_IMPORT_ERROR_LABELS[err.error]}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        : null}

        {searched && totalFound > 0 ?
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-black/60">
                На странице
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const ps = Number(e.target.value) as OfferSearchPageSize;
                    setPageSize(ps);
                    setPageLocal(1);
                  }}
                  className="rounded-lg border border-black/15 px-2 py-1"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy || safePage <= 1}
                onClick={() => setPageLocal(safePage - 1)}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                ← Назад
              </button>
              <button
                type="button"
                disabled={busy || safePage >= totalPages}
                onClick={() => setPageLocal(safePage + 1)}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                Вперёд →
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={selectAllVisible}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
              >
                Выбрать на странице
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(new Set())}
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium"
              >
                Снять выбор
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void importSelected()}
                className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Создать кандидатов предложений ({selected.size})
              </button>
            </div>

            <ul className="space-y-3">
              {pageResults.map((item) => (
                <li key={item.url} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.url)}
                      onChange={() => toggleUrl(item.url)}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-black">{item.title}</span>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-900">
                          {catalogSourceNameLabel(item.sourceName)}
                        </span>
                        {item.relevance === "match" ?
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">
                            релевантно
                          </span>
                        : item.relevance === "relevance_unknown" ?
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                            релевантность не проверена
                          </span>
                        : null}
                      </div>
                      <p className="mt-1 text-black/55">
                        {[
                          item.price ? `${Number(item.price).toLocaleString("ru-RU")} ₽` : null,
                          item.city || null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {item.shortSnippet ?
                        <p className="mt-1 line-clamp-2 text-black/45">{item.shortSnippet}</p>
                      : null}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block break-all text-xs font-medium text-[#c25a00] underline"
                      >
                        {item.url}
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        : null}

        {searched && totalFound === 0 && !busy ?
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {EMPTY_REASON_LABEL[emptyReason ?? ""] ??
              message ??
              "Объявления не найдены. Измените запрос, город или источник."}
          </p>
        : null}
      </div>

      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
    </div>
  );
}
