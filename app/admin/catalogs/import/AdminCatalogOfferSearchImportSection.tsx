"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  OfferImportGoToDraftsBanner,
  OFFER_SOURCE_OPTIONS,
  type OfferSourceFilter,
} from "./offerImportUi";

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

type PageSize = 20 | 50;

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [searched, setSearched] = useState(false);
  const [searchStats, setSearchStats] = useState<OfferSearchStats | null>(null);
  const [diagnostics, setDiagnostics] = useState<OfferSourceSearchDiagnostic[]>([]);

  useEffect(() => {
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, []);

  const cityLabel = catalogDiscoverCityLabel(location);

  const totalFound = results.length;
  const totalPages = Math.max(1, Math.ceil(totalFound / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageResults = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return results.slice(start, start + pageSize);
  }, [results, safePage, pageSize]);

  const shownCount = pageResults.length;

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    setEmptyReason(null);
    setResults([]);
    setSearchStats(null);
    setDiagnostics([]);
    setSelected(new Set());
    setPage(1);
    setCreatedCount(0);
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
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        emptyReason?: string | null;
        results?: OfferSearchResultItem[];
        stats?: OfferSearchStats;
      };
      if (!d.ok) {
        setMessage(d.message ?? d.error ?? "Ошибка поиска");
        setEmptyReason(d.error ?? "SEARCH_FAILED");
        setSearched(true);
        return;
      }
      const list = d.results ?? [];
      setResults(list);
      setSearchStats(d.stats ?? null);
      setDiagnostics(d.stats?.diagnostics ?? []);
      setSearched(true);
      setEmptyReason(d.emptyReason ?? (list.length === 0 ? "NO_RESULTS" : null));
      if (list.length > 0) {
        setMessage(null);
      } else {
        setMessage(
          d.message ??
            EMPTY_REASON_LABEL[d.emptyReason ?? ""] ??
            "Объявления не найдены",
        );
      }
    } catch {
      setMessage("Ошибка сети");
      setEmptyReason("NETWORK");
      setSearched(true);
    } finally {
      setBusy(false);
    }
  }, [query, cityLabel, brand, oemArticle, sourceFilter, priceMin, priceMax]);

  const importSelected = useCallback(async () => {
    const urls = [...selected];
    if (urls.length === 0) return;
    setBusy(true);
    setMessage(null);
    setCreatedCount(0);
    try {
      const fd = new FormData();
      fd.set("kind", "urls");
      fd.set("categorySlug", DEFAULT_CATEGORY);
      fd.set("city", cityLabel);
      fd.set("urls", urls.join("\n"));

      const r = await fetch("/api/admin/catalogs/import/parse", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        errors?: { url: string; error: string }[];
        sourceOfferDrafts?: unknown[];
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка импорта");
        return;
      }
      const offerCount = d.sourceOfferDrafts?.length ?? 0;
      setCreatedCount(offerCount);
      const errN = d.errors?.length ?? 0;
      setMessage(
        `Создано кандидатов предложений: ${offerCount}${errN > 0 ? `, ошибок: ${errN}` : ""}`,
      );
      onChanged?.();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }, [selected, cityLabel, onChanged]);

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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">По поисковому запросу</h3>
        <p className="mt-1 text-sm text-black/55">
          Прямой поиск на Avito, Drom, Youla, VK — без Google и Bing. Открываем страницы поиска площадок,
          извлекаем ссылки на объявления. Выберите ссылки → «Создать кандидатов» разберёт карточки.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-black/60">Поисковый запрос</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="touran Ижевск · насос caterpillar 320 · iphone 12 Казань"
          className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
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

      <button
        type="button"
        disabled={busy || !query.trim()}
        onClick={() => void runSearch()}
        className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Поиск…" : "Найти предложения"}
      </button>

      {searched ?
        <div className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/70">
          <p>
            <span className="font-medium text-black">Найдено всего:</span> {totalFound}
            <span className="mx-2 text-black/30">·</span>
            <span className="font-medium text-black">Показано:</span> {shownCount} из {totalFound}
            <span className="mx-2 text-black/30">·</span>
            <span className="font-medium text-black">Страница:</span> {safePage} из {totalPages}
          </p>
          {searchStats ?
            <p className="text-xs text-black/50">
              Ссылок: {searchStats.linksExtracted}
              <span className="mx-1 text-black/30">·</span>
              Страниц поиска: {searchStats.pagesScanned}
              {searchStats.afterCityFilter !== searchStats.linksExtracted ?
                ` → после города: ${searchStats.afterCityFilter}`
              : ""}
              {searchStats.afterPriceFilter !== searchStats.afterCityFilter ?
                ` → после цены: ${searchStats.afterPriceFilter}`
              : ""}
              {searchStats.pagesPerSource ?
                ` · до ${searchStats.pagesPerSource} стр./источник`
              : ""}
            </p>
          : null}
          {searchStats?.sourceCounts ?
            <p>
              <span className="font-medium text-black">Источники:</span>{" "}
              {(["avito", "drom", "youla", "vk"] as const)
                .map((k) => `${SOURCE_DIAG_LABEL[k]}: ${searchStats.sourceCounts[k] ?? 0}`)
                .join(" · ")}
            </p>
          : null}
          {searchStats?.hidden && Object.keys(searchStats.hidden).length > 0 ?
            <p className="text-xs text-amber-900">
              <span className="font-medium">Скрыто:</span>{" "}
              {Object.entries(searchStats.hidden)
                .map(([k, v]) => `${HIDDEN_REASON_LABEL[k] ?? k}: ${v}`)
                .join(" · ")}
            </p>
          : null}
          {diagnostics.length > 0 ?
            <div className="grid gap-2 sm:grid-cols-2">
              {diagnostics.map((diag) => (
                <div key={diag.sourceName} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs">
                  <p className="font-medium text-black">{SOURCE_DIAG_LABEL[diag.sourceName] ?? diag.sourceName}</p>
                  <p className="mt-0.5 text-black/55">
                    {diag.blocked ? "заблокирован" : "доступ OK"}
                    {" · "}
                    ссылок: {diag.linksExtracted}
                    {" · "}
                    стр.: {diag.pagesScanned}
                    {diag.parserErrors > 0 ? ` · ошибки: ${diag.parserErrors}` : ""}
                  </p>
                  <p className="text-black/50">HTTP {diag.httpStatus ?? "—"}</p>
                  {diag.searchUrls.length > 0 ?
                    <ul className="mt-1 space-y-0.5 text-black/40">
                      {diag.searchUrls.map((u) => (
                        <li key={u} className="break-all">
                          {u}
                        </li>
                      ))}
                    </ul>
                  : null}
                    {diag.linksExtracted === 0 && (diag.message || diag.zeroReason) ?
                      <p className="mt-1 text-amber-900">
                        {diag.message ?? OFFER_SOURCE_ZERO_LABELS[diag.zeroReason ?? ""] ?? diag.zeroReason}
                      </p>
                    : null}
                  {Object.keys(diag.skipReasons).length > 0 ?
                    <p className="mt-0.5 text-black/40">
                      Пропуски:{" "}
                      {Object.entries(diag.skipReasons)
                        .map(([k, v]) => `${HIDDEN_REASON_LABEL[k] ?? k}: ${v}`)
                        .join(", ")}
                    </p>
                  : null}
                </div>
              ))}
            </div>
          : null}
        </div>
      : null}

      {message ?
        <p className="text-sm font-medium text-amber-900">{message}</p>
      : null}

      {searched && totalFound > 0 ?
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-black/60">
              На странице
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as PageSize);
                  setPage(1);
                }}
                className="rounded-lg border border-black/15 px-2 py-1"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              ← Назад
            </button>
            <button
              type="button"
              disabled={busy || safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
                      <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs text-black/55">
                        {PARSE_QUALITY_LABEL[item.parseQuality] ?? item.parseQuality}
                      </span>
                    </div>
                    <p className="mt-1 text-black/55">
                      {[
                        item.price ? `${Number(item.price).toLocaleString("ru-RU")} ₽` : null,
                        item.city || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {(item.companyName || item.sellerName) && (
                      <p className="mt-1 text-xs text-black/50">
                        {item.companyName ? `Компания: ${item.companyName}` : ""}
                        {item.companyName && item.sellerName ? " · " : ""}
                        {item.sellerName ? `Продавец: ${item.sellerName}` : ""}
                      </p>
                    )}
                    {item.shortSnippet ?
                      <p className="mt-1 line-clamp-2 text-black/45">{item.shortSnippet}</p>
                    : null}
                    {(item.brand || item.oemCodes.length > 0 || item.articleCodes.length > 0) && (
                      <p className="mt-1 text-xs text-black/40">
                        {item.brand ? `Бренд: ${item.brand}` : ""}
                        {item.oemCodes.length > 0 ? ` · OEM: ${item.oemCodes.join(", ")}` : ""}
                        {item.articleCodes.length > 0 ? ` · Арт.: ${item.articleCodes.join(", ")}` : ""}
                      </p>
                    )}
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
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {EMPTY_REASON_LABEL[emptyReason ?? ""] ??
            message ??
            "Объявления не найдены. Измените запрос, город или источник."}
        </p>
      : null}

      <OfferImportGoToDraftsBanner count={createdCount} onGoToDrafts={onGoToDrafts} />
    </div>
  );
}
