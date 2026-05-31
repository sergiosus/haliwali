import { logCatalogDiscover } from "./catalogCatalogLog";
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

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

export type OfferParseQuality = "link_only";

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
};

export type OfferSearchStats = {
  linksExtracted: number;
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
  stats: OfferSearchStats;
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
  return {
    url: hit.url,
    title: sanitizeOfferText(hit.title),
    price: hit.price,
    city: sanitizeOfferText(hit.city),
    companyName: "",
    sellerName: sanitizeOfferText(hit.sellerHint),
    sourceName: hit.sourceName,
    shortSnippet: sanitizeOfferText(hit.snippet || hit.title).slice(0, 280),
    brand: null,
    oemCodes: [],
    articleCodes: [],
    parsed: false,
    parseQuality: "link_only",
  };
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
 * 3. Admin selects links → import via parse API (separate step)
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
  let items: OfferSearchResultItem[] = hits.map(hitToResult);

  const stats: OfferSearchStats = {
    linksExtracted: items.length,
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
    if (before > items.length) hidden.city_mismatch = before - items.length;
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
    logCatalogDiscover("offer_link_filter", { dropped: beforeQuality - items.length, hidden });
  }

  stats.linksExtracted = items.length;
  stats.sourceCounts = countBySource(items);

  return {
    ok: true,
    results: items,
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
      items.length === 0 ?
        `Ссылок после фильтров: 0 (было ${hits.length})`
      : `Найдено ${items.length} ссылок. Выберите и создайте кандидатов — поля объявления разберутся при импорте.`,
  };
}
