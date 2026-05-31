import { logCatalogDiscover, logCatalogOfferSearch } from "./catalogCatalogLog";
import type { OfferSearchApiErrorDetail } from "./catalogOfferSearchApiError";
import {
  buildDirectMarketplaceSearchUrls,
  offerSourcesForFilter,
  searchOfferListingSources,
  type OfferSourceSearchDiagnostic,
  type OfferSourceSearchHit,
  type OfferListingSourceId,
} from "./catalogOfferSourceSearch";
import {
  hasBadEncoding,
  isRealOfferListingUrl,
  sanitizeOfferText,
} from "./catalogOfferSearchText";
import {
  CATALOG_MARKETPLACE_SOURCES,
  type CatalogSourceName,
} from "./catalogSourceOfferTypes";
import { offerMatchesSearchQuery } from "./catalogOfferSearchRelevance";
import { titleFromListingUrl } from "./catalogOfferSearchText";

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

export type OfferParseQuality = "link_only";

export type OfferSearchRelevance = "match" | "skipped" | "relevance_unknown";

export type OfferSearchSkipReason = "query_mismatch";

export type OfferSearchResultItem = {
  url: string;
  title: string;
  price: string | null;
  city: string;
  companyName: string;
  sellerName: string;
  sourceName: CatalogSourceName;
  shortSnippet: string;
  brand: string | null;
  oemCodes: string[];
  articleCodes: string[];
  parsed: boolean;
  parseQuality: OfferParseQuality;
  relevance: OfferSearchRelevance;
  skipReason?: OfferSearchSkipReason | null;
};

function brandFromListingUrl(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const withoutId = seg.replace(/_\d{8,}$/, "").replace(/\.html$/i, "");
    const parts = withoutId.split(/[_-]+/).filter(Boolean);
    if (parts.length >= 2 && /^[a-z]+$/i.test(parts[0]!)) {
      return parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type OfferSearchStats = {
  /** Raw listing links from marketplace SERP (before admin filters). */
  linksExtracted: number;
  /** After city/price/brand/dedup/quality filters, before relevance. */
  beforeRelevanceFilter: number;
  relevantCount: number;
  relevanceRejected: number;
  relevanceFilterFailed: boolean;
  pagesScanned: number;
  afterCityFilter: number;
  afterPriceFilter: number;
  afterBrandOemFilter: number;
  afterDuplicateFilter: number;
  sourceCounts: Partial<Record<OfferListingSourceId, number>>;
  hidden: Record<string, number>;
  diagnostics: OfferSourceSearchDiagnostic[];
  directSearchUrls: Partial<Record<OfferListingSourceId, string[]>>;
  pagesPerSource: number;
};

export type OfferSearchResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  emptyReason?: string | null;
  results: OfferSearchResultItem[];
  /** Filtered out as irrelevant to query (e.g. query_mismatch). */
  skipped?: OfferSearchResultItem[];
  stats: OfferSearchStats;
  sessionId?: number | null;
  searchError?: OfferSearchApiErrorDetail;
};

const MAX_RESULTS = 100;
const PAGES_PER_SOURCE = 3;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function parsePriceNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function listingSourceFromUrl(url: string): OfferListingSourceId | null {
  const lower = url.toLowerCase();
  if (lower.includes("avito.ru")) return "avito";
  if (lower.includes("drom.ru") || lower.includes("auto.ru")) return "drom";
  if (lower.includes("youla.ru")) return "youla";
  if (lower.includes("vk.com") || lower.includes("vk.ru")) return "vk";
  return null;
}

function hitToResult(hit: OfferSourceSearchHit): OfferSearchResultItem {
  const title =
    sanitizeOfferText(hit.title) || titleFromListingUrl(hit.url) || "";
  return {
    url: hit.url,
    title,
    price: hit.price,
    city: sanitizeOfferText(hit.city),
    companyName: "",
    sellerName: sanitizeOfferText(hit.sellerHint),
    sourceName: hit.sourceName,
    shortSnippet: sanitizeOfferText(hit.snippet || hit.title).slice(0, 280),
    brand: brandFromListingUrl(hit.url),
    oemCodes: [],
    articleCodes: [],
    parsed: false,
    parseQuality: "link_only",
    relevance: "match",
    skipReason: null,
  };
}

function applyQueryRelevanceFilter(
  query: string,
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
): { matched: OfferSearchResultItem[]; skipped: OfferSearchResultItem[] } {
  const matched: OfferSearchResultItem[] = [];
  const skipped: OfferSearchResultItem[] = [];
  for (const item of items) {
    if (
      offerMatchesSearchQuery(query, {
        title: item.title,
        shortSnippet: item.shortSnippet,
        url: item.url,
        brand: item.brand,
      })
    ) {
      matched.push({ ...item, relevance: "match", skipReason: null });
    } else {
      skipped.push({ ...item, relevance: "skipped", skipReason: "query_mismatch" });
      hidden.query_mismatch = (hidden.query_mismatch ?? 0) + 1;
    }
  }
  return { matched, skipped };
}

function applyQueryRelevanceFilterSafe(
  query: string,
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
): {
  matched: OfferSearchResultItem[];
  skipped: OfferSearchResultItem[];
  filterFailed: boolean;
  filterError?: string;
} {
  try {
    const { matched, skipped } = applyQueryRelevanceFilter(query, items, hidden);
    if (matched.length === 0 && items.length > 0) {
      const filterError = "no_relevant_matches";
      logCatalogOfferSearch("relevance_zero_fallback", {
        query: query.slice(0, 60),
        kept: items.length,
        rejected: skipped.length,
      });
      return {
        matched: items.map((item) => ({
          ...item,
          relevance: "relevance_unknown" as const,
          skipReason: null,
        })),
        skipped: [],
        filterFailed: true,
        filterError,
      };
    }
    return { matched, skipped, filterFailed: false };
  } catch (err) {
    const filterError = err instanceof Error ? err.message : String(err);
    logCatalogOfferSearch("relevance_filter_failed", { error: filterError, kept: items.length });
    const matched = items.map((item) => ({
      ...item,
      relevance: "relevance_unknown" as const,
      skipReason: null,
    }));
    return { matched, skipped: [], filterFailed: true, filterError };
  }
}

function enrichDiagnosticsWithRelevance(
  diagnostics: OfferSourceSearchDiagnostic[],
  matched: OfferSearchResultItem[],
  skipped: OfferSearchResultItem[],
): OfferSourceSearchDiagnostic[] {
  const relevantBySource = countBySource(matched);
  const rejectedBySource = countBySource(skipped);
  return diagnostics.map((d) => ({
    ...d,
    relevantCount: relevantBySource[d.sourceName] ?? 0,
    rejectedByRelevance: rejectedBySource[d.sourceName] ?? 0,
  }));
}

function countBySource(items: OfferSearchResultItem[]): OfferSearchStats["sourceCounts"] {
  const counts = Object.fromEntries(
    CATALOG_MARKETPLACE_SOURCES.map((s) => [s, 0]),
  ) as Record<OfferListingSourceId, number>;
  for (const item of items) {
    const src = listingSourceFromUrl(item.url);
    if (src) counts[src] = (counts[src] ?? 0) + 1;
  }
  return counts;
}

function matchesCity(item: OfferSearchResultItem, city: string): boolean {
  if (!city.trim()) return true;
  // SERP cards often have no city — do not drop when unknown.
  if (!item.city.trim()) return true;
  const needle = norm(city);
  const blob = norm(`${item.city} ${item.title} ${item.shortSnippet} ${item.url}`);
  return blob.includes(needle);
}

function matchesBrandOem(item: OfferSearchResultItem, brand: string, oemArticle: string): boolean {
  const blob = norm(`${item.title} ${item.shortSnippet}`);
  if (brand && !blob.includes(norm(brand))) return false;
  if (oemArticle && !blob.includes(norm(oemArticle))) return false;
  return true;
}

function matchesPrice(item: OfferSearchResultItem, priceMin?: number, priceMax?: number): boolean {
  if (priceMin == null && priceMax == null) return true;
  const p = parsePriceNumber(item.price);
  if (p == null) return true;
  if (priceMin != null && p < priceMin) return false;
  if (priceMax != null && p > priceMax) return false;
  return true;
}

function filterLinkResults(
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
): OfferSearchResultItem[] {
  const out: OfferSearchResultItem[] = [];
  for (const item of items) {
    if (hasBadEncoding(item.title) || hasBadEncoding(item.shortSnippet)) {
      hidden.bad_encoding = (hidden.bad_encoding ?? 0) + 1;
      continue;
    }
    const src = listingSourceFromUrl(item.url);
    if (src && !isRealOfferListingUrl(item.url, src)) {
      hidden.not_listing = (hidden.not_listing ?? 0) + 1;
      continue;
    }
    if (!item.url?.trim() || !item.title?.trim()) {
      hidden.insufficient_fields = (hidden.insufficient_fields ?? 0) + 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

function emptyStats(
  directSearchUrls: Partial<Record<OfferListingSourceId, string[]>> = {},
): OfferSearchStats {
  return {
    linksExtracted: 0,
    beforeRelevanceFilter: 0,
    relevantCount: 0,
    relevanceRejected: 0,
    relevanceFilterFailed: false,
    pagesScanned: 0,
    afterCityFilter: 0,
    afterPriceFilter: 0,
    afterBrandOemFilter: 0,
    afterDuplicateFilter: 0,
    sourceCounts: {},
    hidden: {},
    diagnostics: [],
    directSearchUrls,
    pagesPerSource: PAGES_PER_SOURCE,
  };
}

/**
 * Direct marketplace search — no Google/Bing/Yandex APIs.
 * 1. Build Avito/Drom/Youla/VK search URLs
 * 2. Fetch search pages, extract listing links
 * 3. Admin selects links → import via import-selections API
 */
export async function searchOffersForAdmin(opts: {
  query: string;
  city?: string;
  brand?: string;
  oemArticle?: string;
  sourceFilter?: OfferSearchSourceFilter;
  priceMin?: number;
  priceMax?: number;
}): Promise<OfferSearchResponse> {
  const query = opts.query.trim();
  if (!query) {
    return {
      ok: false,
      error: "EMPTY_QUERY",
      message: "Введите поисковый запрос",
      results: [],
      stats: emptyStats(),
      emptyReason: "EMPTY_QUERY",
    };
  }

  const city = (opts.city ?? "").trim();
  const brand = (opts.brand ?? "").trim();
  const oemArticle = (opts.oemArticle ?? "").trim();
  const sourceFilter = opts.sourceFilter ?? "all";
  const hidden: Record<string, number> = {};

  if (sourceFilter === "company_site" || sourceFilter === "other") {
    return {
      ok: false,
      error: "UNSUPPORTED_SOURCE",
      message: "Для сайтов компаний используйте «По ссылкам» или «Из текста/VK». Поиск по запросу — только Avito, Drom, Youla, VK.",
      results: [],
      stats: emptyStats(),
      emptyReason: "UNSUPPORTED_SOURCE",
    };
  }

  const sources = offerSourcesForFilter(sourceFilter);
  const directSearchUrls = buildDirectMarketplaceSearchUrls(query, city, sources);

  logCatalogOfferSearch("admin_search_start", {
    query: query.slice(0, 60),
    city: city.slice(0, 40),
    sourceFilter,
    sources,
  });

  logCatalogDiscover("offer_direct_search", {
    query: query.slice(0, 60),
    sources,
    urls: Object.fromEntries(sources.map((s) => [s, directSearchUrls[s]?.[0] ?? ""])),
  });

  const { hits, diagnostics } = await searchOfferListingSources({
    query,
    city,
    sources,
    maxPages: PAGES_PER_SOURCE,
    maxTotal: MAX_RESULTS,
  });

  const pagesScanned = diagnostics.reduce((n, d) => n + d.pagesScanned, 0);
  const rawLinkCount = hits.length;
  let items: OfferSearchResultItem[] = hits.map(hitToResult);

  logCatalogOfferSearch("admin_links_from_sources", {
    rawLinkCount,
    pagesScanned,
    diagnostics: diagnostics.map((d) => ({
      source: d.sourceName,
      found: d.linksExtracted,
      httpStatus: d.httpStatus,
      error: d.errorMessage ?? d.zeroReason,
    })),
  });

  const stats: OfferSearchStats = {
    linksExtracted: rawLinkCount,
    beforeRelevanceFilter: 0,
    relevantCount: 0,
    relevanceRejected: 0,
    relevanceFilterFailed: false,
    pagesScanned,
    afterCityFilter: 0,
    afterPriceFilter: 0,
    afterBrandOemFilter: 0,
    afterDuplicateFilter: 0,
    sourceCounts: {},
    hidden,
    diagnostics,
    directSearchUrls,
    pagesPerSource: PAGES_PER_SOURCE,
  };

  if (items.length === 0) {
    return {
      ok: true,
      results: [],
      stats,
      emptyReason: "NO_LINKS_EXTRACTED",
      message:
        diagnostics.map((d) => d.message ?? `${d.sourceName}: ${d.zeroReason ?? "empty"}`).join(" · ") ||
        "На страницах поиска не найдено ссылок на объявления",
    };
  }

  if (city) {
    const before = items.length;
    items = items.filter((i) => matchesCity(i, city));
    const cityDropped = before - items.length;
    if (cityDropped > 0) hidden.city_mismatch = cityDropped;
    logCatalogOfferSearch("admin_after_city_filter", { before, after: items.length, cityDropped });
  }
  stats.afterCityFilter = items.length;

  const priceMin = opts.priceMin;
  const priceMax = opts.priceMax;
  if (priceMin != null || priceMax != null) {
    const before = items.length;
    items = items.filter((i) => matchesPrice(i, priceMin, priceMax));
    if (before > items.length) hidden.price_filter = before - items.length;
  }
  stats.afterPriceFilter = items.length;

  if (brand || oemArticle) {
    const before = items.length;
    items = items.filter((i) => matchesBrandOem(i, brand, oemArticle));
    if (before > items.length) hidden.brand_oem = before - items.length;
  }
  stats.afterBrandOemFilter = items.length;

  const deduped: OfferSearchResultItem[] = [];
  const seenUrl = new Set<string>();
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (seenUrl.has(key)) {
      hidden.duplicate = (hidden.duplicate ?? 0) + 1;
      continue;
    }
    seenUrl.add(key);
    deduped.push(item);
  }
  items = deduped;
  stats.afterDuplicateFilter = items.length;

  const beforeQuality = items.length;
  items = filterLinkResults(items, hidden);
  if (beforeQuality > items.length) {
    logCatalogOfferSearch("admin_quality_filter", { dropped: beforeQuality - items.length, hidden });
  }

  stats.beforeRelevanceFilter = items.length;
  logCatalogOfferSearch("admin_before_relevance", { count: items.length, query: query.slice(0, 40) });

  const {
    matched,
    skipped,
    filterFailed,
    filterError,
  } = applyQueryRelevanceFilterSafe(query, items, hidden);
  items = matched;
  stats.relevantCount = matched.length;
  stats.relevanceRejected = skipped.length;
  stats.relevanceFilterFailed = filterFailed;
  stats.sourceCounts = countBySource(items);
  stats.diagnostics = enrichDiagnosticsWithRelevance(diagnostics, matched, skipped);

  logCatalogOfferSearch("admin_relevance_done", {
    relevant: matched.length,
    rejected: skipped.length,
    filterFailed,
    filterError: filterError?.slice(0, 120),
  });

  logCatalogOfferSearch("admin_search_final", {
    rawLinkCount,
    beforeRelevance: stats.beforeRelevanceFilter,
    relevant: items.length,
    rejected: skipped.length,
  });

  return {
    ok: true,
    results: items,
    skipped,
    stats,
    emptyReason:
      items.length === 0 ?
        city ?
          "ALL_FILTERED_CITY"
        : priceMin != null || priceMax != null ?
          "ALL_FILTERED_PRICE"
        : brand || oemArticle ?
          "ALL_FILTERED_BRAND_OEM"
        : "ALL_FILTERED"
      : null,
    message:
      filterFailed ?
        `Фильтр релевантности недоступен — показаны все ${items.length} ссылок (${filterError ?? "ошибка"})`
      : items.length === 0 && skipped.length > 0 ?
        `Релевантных: 0. Скрыто по запросу: ${skipped.length} (всего с площадок: ${rawLinkCount})`
      : items.length === 0 ?
        `Ссылок после фильтров: 0 (с площадок: ${rawLinkCount})`
      : `Найдено ${items.length} ссылок. Выберите и создайте кандидатов — поля объявления разберутся при импорте.`,
  };
}
