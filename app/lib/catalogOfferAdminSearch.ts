import { logCatalogDiscover, logCatalogOfferSearch } from "./catalogCatalogLog";
import type { OfferSearchApiErrorDetail } from "./catalogOfferSearchApiError";
import {
  disabledSourcesForResolved,
  disabledSourceMessage,
  resolveOfferSearchSources,
  resolveOfferTypeForSearch,
  shouldRunDromFallback,
  type OfferTypeFilter,
} from "./catalogSourceOfferType";
import {
  passesAutomotiveRelevance,
  scoreAutomotiveOffer,
} from "./catalogOfferAutoRelevance";
import {
  getCachedOfferSearch,
  setCachedOfferSearch,
  type OfferSearchCacheKey,
} from "./catalogOfferSearchCache";
import {
  buildDirectMarketplaceSearchUrls,
  searchOfferListingSources,
  type OfferSourceSearchDiagnostic,
  type OfferSourceSearchHit,
  type OfferListingSourceId,
} from "./catalogOfferSourceSearch";
import {
  catalogSourceDiagnosticMessage,
  isMarketplaceRegistryId,
  registryDiagnosticForSource,
} from "./catalogSourceRegistry";
import { offerListingSourceFromUrl } from "./catalogSourceName";
import {
  hasBadEncoding,
  isRealOfferListingUrl,
  sanitizeOfferText,
} from "./catalogOfferSearchText";
import {
  CATALOG_MARKETPLACE_SOURCES,
  type CatalogSourceName,
} from "./catalogSourceOfferTypes";
import {
  offerHasUnrelatedAutoBrand,
  offerMatchesSearchQuery,
  offerMatchesSearchQueryStrict,
} from "./catalogOfferSearchRelevance";
import { titleFromListingUrl } from "./catalogOfferSearchText";

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "auto_ru"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

export type OfferParseQuality = "link_only" | "search_card";

export type OfferSearchSortMode = "exact_match" | "price" | "newest";

export type OfferSearchRelevance = "match" | "skipped" | "relevance_unknown";

export type OfferSearchSkipReason = "query_mismatch";

export type OfferSearchResultItem = {
  url: string;
  title: string;
  price: string | null;
  priceAmount?: number | null;
  priceText?: string | null;
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
  coverImageUrl?: string | null;
  imageFound?: boolean;
  imageSource?: import("./catalogAvitoCoverImage").AvitoCoverImageSource;
  priceSource?: import("./catalogOfferPriceDiagnostics").OfferPriceSource;
  offerType?: import("./catalogSourceOfferType").CatalogSourceOfferType;
  year?: number | null;
  mileageKm?: number | null;
  relevanceScore?: number;
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
  /** Diagnostics for admin UX. */
  linksShown: number;
  timedOut: boolean;
  priceFoundCount: number;
  imageFoundCount: number;
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
  fromCache?: boolean;
  automotive?: boolean;
  offerType?: import("./catalogSourceOfferType").CatalogSourceOfferType;
  sort?: OfferSearchSortMode;
};

const MAX_RESULTS = 100;
const PAGES_PER_SOURCE = 3;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function parsePriceNumber(
  raw: string | null | undefined,
  amount?: number | null,
): number | null {
  if (amount != null && Number.isFinite(amount) && amount > 0) return amount;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function listingSourceFromUrl(url: string): OfferListingSourceId | null {
  return offerListingSourceFromUrl(url);
}

function hitToResult(
  hit: OfferSourceSearchHit,
  defaultOfferType: import("./catalogSourceOfferType").CatalogSourceOfferType,
): OfferSearchResultItem {
  const title =
    sanitizeOfferText(hit.title) || titleFromListingUrl(hit.url) || "";
  const cardComplete = Boolean(
    hit.cardComplete ||
    (hit.title && hit.url),
  );
  return {
    url: hit.url,
    title,
    price: hit.price,
    priceAmount: hit.priceAmount ?? null,
    priceText: hit.priceText ?? null,
    city: sanitizeOfferText(hit.city),
    companyName: "",
    sellerName: sanitizeOfferText(hit.sellerHint),
    sourceName: hit.sourceName,
    shortSnippet: sanitizeOfferText(hit.snippet || hit.title).slice(0, 280),
    brand: brandFromListingUrl(hit.url),
    oemCodes: [],
    articleCodes: [],
    parsed: cardComplete,
    parseQuality: cardComplete ? "search_card" : "link_only",
    relevance: "match",
    skipReason: null,
    coverImageUrl: hit.coverImageUrl ?? hit.imageUrl ?? null,
    imageFound: Boolean(hit.coverImageUrl ?? hit.imageUrl),
    imageSource: hit.imageSource ?? (hit.coverImageUrl ? "card_img" : "none"),
    priceSource: hit.priceSource ?? (hit.priceAmount ? "html" : "none"),
    offerType: hit.offerType ?? defaultOfferType,
    year: hit.year ?? null,
    mileageKm: hit.mileageKm ?? null,
  };
}

function sortOfferResults(
  items: OfferSearchResultItem[],
  sort: OfferSearchSortMode,
): OfferSearchResultItem[] {
  const list = [...items];
  if (sort === "price") {
    list.sort((a, b) => {
      const pa = parsePriceNumber(a.price, a.priceAmount) ?? Number.MAX_SAFE_INTEGER;
      const pb = parsePriceNumber(b.price, b.priceAmount) ?? Number.MAX_SAFE_INTEGER;
      return pa - pb;
    });
    return list;
  }
  if (sort === "newest") {
    list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return list;
  }
  list.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  return list;
}

function applyAutomotiveRelevanceFilter(
  query: string,
  items: OfferSearchResultItem[],
  city: string,
  hidden: Record<string, number>,
): { matched: OfferSearchResultItem[]; skipped: OfferSearchResultItem[] } {
  const matched: OfferSearchResultItem[] = [];
  const skipped: OfferSearchResultItem[] = [];
  for (const item of items) {
    const score = scoreAutomotiveOffer(
      query,
      {
        title: item.title,
        shortSnippet: item.shortSnippet,
        url: item.url,
        city: item.city,
        brand: item.brand,
        year: item.year,
      },
      city,
    );
    if (passesAutomotiveRelevance(query, { title: item.title, shortSnippet: item.shortSnippet, url: item.url, city: item.city, brand: item.brand, year: item.year }, city)) {
      matched.push({ ...item, relevance: "match", relevanceScore: score, skipReason: null });
    } else {
      skipped.push({ ...item, relevance: "skipped", relevanceScore: score, skipReason: "query_mismatch" });
      hidden.query_mismatch = (hidden.query_mismatch ?? 0) + 1;
      if (item.sourceName === "drom") hidden.drom_unrelated = (hidden.drom_unrelated ?? 0) + 1;
    }
  }
  return { matched, skipped };
}

function relevanceFields(item: OfferSearchResultItem) {
  return {
    title: item.title,
    shortSnippet: item.shortSnippet,
    url: item.url,
    brand: item.brand,
  };
}

function itemPassesRelevance(query: string, item: OfferSearchResultItem): boolean {
  const fields = relevanceFields(item);
  const src = listingSourceFromUrl(item.url);
  if (offerHasUnrelatedAutoBrand(query, fields)) return false;
  if (src === "drom") {
    return offerMatchesSearchQueryStrict(query, fields, { allowUrlFallback: true });
  }
  return offerMatchesSearchQuery(query, fields);
}

function applyQueryRelevanceFilter(
  query: string,
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
): { matched: OfferSearchResultItem[]; skipped: OfferSearchResultItem[] } {
  const matched: OfferSearchResultItem[] = [];
  const skipped: OfferSearchResultItem[] = [];
  for (const item of items) {
    if (itemPassesRelevance(query, item)) {
      matched.push({ ...item, relevance: "match", skipReason: null });
    } else {
      skipped.push({ ...item, relevance: "skipped", skipReason: "query_mismatch" });
      hidden.query_mismatch = (hidden.query_mismatch ?? 0) + 1;
      if (listingSourceFromUrl(item.url) === "drom") {
        hidden.drom_unrelated = (hidden.drom_unrelated ?? 0) + 1;
      }
    }
  }
  return { matched, skipped };
}

function keepStableSourcesOnRelevanceFailure(
  query: string,
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
  automotive: boolean,
): { matched: OfferSearchResultItem[]; skipped: OfferSearchResultItem[] } {
  const stable = new Set<OfferListingSourceId>(["avito"]);
  const keep = items.filter((i) => stable.has(listingSourceFromUrl(i.url) ?? "avito"));
  const { matched, skipped } = automotive ?
    applyAutomotiveRelevanceFilter(query, keep, "", hidden)
  : applyQueryRelevanceFilter(query, keep, hidden);
  const drop = items.filter((i) => !stable.has(listingSourceFromUrl(i.url) ?? "avito"));
  for (const item of drop) {
    skipped.push({ ...item, relevance: "skipped", skipReason: "query_mismatch" });
    hidden.drom_unreliable = (hidden.drom_unreliable ?? 0) + 1;
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
      logCatalogOfferSearch("relevance_zero_avito_only", {
        query: query.slice(0, 60),
        total: items.length,
        rejected: skipped.length,
      });
      const stableFallback = keepStableSourcesOnRelevanceFailure(query, items, hidden, false);
      return {
        ...stableFallback,
        filterFailed: true,
        filterError,
      };
    }
    return { matched, skipped, filterFailed: false };
  } catch (err) {
    const filterError = err instanceof Error ? err.message : String(err);
    logCatalogOfferSearch("relevance_filter_failed", { error: filterError, kept: items.length });
    const stableFallback = keepStableSourcesOnRelevanceFailure(query, items, hidden, false);
    return { ...stableFallback, filterFailed: true, filterError };
  }
}

function applyQueryRelevanceFilterSafeAutomotive(
  query: string,
  items: OfferSearchResultItem[],
  city: string,
  hidden: Record<string, number>,
): {
  matched: OfferSearchResultItem[];
  skipped: OfferSearchResultItem[];
  filterFailed: boolean;
  filterError?: string;
} {
  try {
    const { matched, skipped } = applyAutomotiveRelevanceFilter(query, items, city, hidden);
    if (matched.length === 0 && items.length > 0) {
      const stableFallback = keepStableSourcesOnRelevanceFailure(query, items, hidden, true);
      return {
        ...stableFallback,
        filterFailed: true,
        filterError: "no_relevant_matches",
      };
    }
    return { matched, skipped, filterFailed: false };
  } catch (err) {
    const filterError = err instanceof Error ? err.message : String(err);
    const stableFallback = keepStableSourcesOnRelevanceFailure(query, items, hidden, true);
    return { ...stableFallback, filterFailed: true, filterError };
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
  const p = parsePriceNumber(item.price, item.priceAmount);
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
    linksShown: 0,
    timedOut: false,
    priceFoundCount: 0,
    imageFoundCount: 0,
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
  /** Explicit marketplace sources from admin checkboxes (overrides sourceFilter when set). */
  enabledSources?: OfferListingSourceId[];
  offerTypeFilter?: OfferTypeFilter;
  categorySlug?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: OfferSearchSortMode;
  skipCache?: boolean;
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
  const categorySlug = (opts.categorySlug ?? "").trim();
  const sortMode: OfferSearchSortMode = opts.sort ?? "exact_match";
  const offerTypeFilter = opts.offerTypeFilter ?? "all";
  const offerType = resolveOfferTypeForSearch({
    offerTypeFilter,
    query,
    categorySlug,
    oemArticle,
  });
  const automotive = offerType === "auto";
  const hidden: Record<string, number> = {};

  const enabledSources = opts.enabledSources?.length ? [...opts.enabledSources] : undefined;

  const cacheKey: OfferSearchCacheKey = {
    query,
    city,
    brand,
    oemArticle,
    sourceFilter: enabledSources ? enabledSources.join(",") : sourceFilter,
    categorySlug,
    offerType: offerTypeFilter,
    priceMin: opts.priceMin,
    priceMax: opts.priceMax,
    sort: sortMode,
  };

  if (!opts.skipCache) {
    const cached = getCachedOfferSearch(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true, automotive, sort: sortMode };
    }
  }

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

  const resolved =
    enabledSources ?
      { offerType, primary: enabledSources, fallback: [] as OfferListingSourceId[] }
    : sourceFilter === "all" ?
      resolveOfferSearchSources({
        sourceFilter,
        query,
        categorySlug,
        oemArticle,
        offerTypeFilter,
      })
    : {
        offerType,
        primary: (
          sourceFilter === "avito" ? ["avito"]
          : sourceFilter === "auto_ru" ? ["auto_ru"]
          : sourceFilter === "drom" ? ["drom"]
          : sourceFilter === "youla" ? ["youla"]
          : sourceFilter === "vk" ? ["vk"]
          : []
        ) as OfferListingSourceId[],
        fallback: [],
      };

  let sources: OfferListingSourceId[] = [...resolved.primary];
  const directSearchUrls = buildDirectMarketplaceSearchUrls(query, city, sources);

  logCatalogOfferSearch("admin_search_start", {
    query: query.slice(0, 60),
    city: city.slice(0, 40),
    sourceFilter,
    sources,
    offerType: resolved.offerType,
  });

  logCatalogDiscover("offer_direct_search", {
    query: query.slice(0, 60),
    sources,
    urls: Object.fromEntries(sources.map((s) => [s, directSearchUrls[s]?.[0] ?? ""])),
  });

  let { hits, diagnostics } = await searchOfferListingSources({
    query,
    city,
    sources,
    maxPages: PAGES_PER_SOURCE,
    maxTotal: MAX_RESULTS,
  });

  for (const d of diagnostics) {
    if (!isMarketplaceRegistryId(d.sourceName)) continue;
    const msg =
      registryDiagnosticForSource(d.sourceName, d.linksExtracted) ||
      catalogSourceDiagnosticMessage(d.sourceName, {
        linksExtracted: d.linksExtracted,
        zeroReason: d.zeroReason,
      });
    if (msg && d.linksExtracted === 0) {
      if (!d.message || /VK parser not implemented/i.test(d.message)) {
        d.message = msg;
      }
      if (!d.errorMessage || /VK parser not implemented/i.test(d.errorMessage)) {
        d.errorMessage = msg;
      }
    }
  }

  if (shouldRunDromFallback(resolved, hits.length)) {
    const fallback = await searchOfferListingSources({
      query,
      city,
      sources: ["drom"],
      maxPages: 1,
      maxTotal: MAX_RESULTS,
    });
    hits = [...hits, ...fallback.hits];
    diagnostics = [...diagnostics, ...fallback.diagnostics];
  }

  const disabledSources = disabledSourcesForResolved(resolved, sources);
  for (const s of disabledSources) {
    if (diagnostics.some((d) => d.sourceName === s)) continue;
    const msg = disabledSourceMessage(s);
    diagnostics.push({
      sourceName: s,
      searched: false,
      blocked: s === "youla",
      searchUrls: [],
      httpStatus: null,
      pagesScanned: 0,
      linksExtracted: 0,
      skippedCount: 0,
      parserErrors: 0,
      zeroReason: s === "vk" ? "unsupported" : "disabled",
      skipReasons: {},
      message:
        msg ??
        (s === "drom" && resolved.offerType === "auto" ?
          "Drom — экспериментальный (резерв, не использован)."
        : `${s} не включён в поиск`),
    });
  }

  const pagesScanned = diagnostics.reduce((n, d) => n + d.pagesScanned, 0);
  const rawLinkCount = hits.length;
  let items: OfferSearchResultItem[] = hits.map((h) => hitToResult(h, resolved.offerType));

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
    linksShown: 0,
    timedOut: diagnostics.some((d) => d.timedOut),
    priceFoundCount: 0,
    imageFoundCount: 0,
  };

  if (items.length === 0) {
    const diagLines = diagnostics.map((d) => d.message ?? `${d.sourceName}: ${d.zeroReason ?? "empty"}`);
    const youlaCaptcha = diagnostics.some(
      (d) => d.sourceName === "youla" && (d.zeroReason === "captcha" || d.zeroReason === "disabled"),
    );
    const vkUnsupported = diagnostics.some(
      (d) => d.sourceName === "vk" && d.zeroReason === "unsupported",
    );
    const parts = [...diagLines];
    if (youlaCaptcha && !parts.some((p) => /youla/i.test(p))) {
      parts.push("Youla blocked by captcha");
    }
    if (vkUnsupported && !parts.some((p) => /vk/i.test(p))) {
      parts.push("VK parser not implemented yet");
    }
    if (disabledSources.length > 0 && sourceFilter === "all") {
      for (const s of disabledSources) {
        if (s === "youla" && !parts.some((p) => /youla/i.test(p))) {
          parts.push("Youla blocked by captcha (не включён в поиск)");
        }
        if (s === "vk" && !parts.some((p) => /vk/i.test(p))) {
          parts.push("VK parser not implemented yet");
        }
      }
    }
    return {
      ok: true,
      results: [],
      stats,
      emptyReason:
        youlaCaptcha ? "SOURCE_CAPTCHA"
        : vkUnsupported ? "SOURCE_UNSUPPORTED"
        : "NO_LINKS_EXTRACTED",
      message: parts.join(" · ") || "На страницах поиска не найдено ссылок на объявления",
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
  stats.linksShown = items.length;

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

  // Stage-1 search is lightweight → price/image are expected to be missing.
  stats.priceFoundCount = items.filter((i) => Boolean(i.priceAmount && i.priceAmount > 0)).length;
  stats.imageFoundCount = items.filter((i) => Boolean(i.coverImageUrl)).length;

  const response: OfferSearchResponse = {
    ok: true,
    results: items,
    skipped,
    stats,
    automotive: resolved.offerType === "auto",
    offerType: resolved.offerType,
    sort: sortMode,
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
        resolved.offerType === "auto" ?
          `Релевантных совпадений мало — показаны Avito и Auto.ru (${items.length}). Drom скрыт.`
        : `Релевантных совпадений нет — показаны только Avito (${items.length}). Drom и прочие нерелевантные скрыты.`
      : items.length === 0 && skipped.length > 0 ?
        `Релевантных: 0. Скрыто по запросу: ${skipped.length} (всего с площадок: ${rawLinkCount})`
      : items.length === 0 ?
        `Ссылок после фильтров: 0 (с площадок: ${rawLinkCount})`
      : `Найдено ${items.length} ссылок. Выберите и создайте кандидатов — поля с карточки поиска, без открытия объявления.`,
  };

  setCachedOfferSearch(cacheKey, response);
  return response;
}
