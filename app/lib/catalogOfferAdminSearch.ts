import { logCatalogDiscover } from "./catalogCatalogLog";
import { catalogSourceNameFromUrl } from "./catalogSourceName";
import {
  offerSourcesForFilter,
  searchOfferListingSources,
  type OfferSourceSearchDiagnostic,
  type OfferSourceSearchHit,
  type OfferListingSourceId,
} from "./catalogOfferSourceSearch";
import { previewSourceOffersFromUrls } from "./catalogSourceOfferExtractionService";
import {
  hasBadEncoding,
  isRealOfferListingUrl,
  meetsMinimumOfferFields,
  sanitizeOfferText,
  validateOfferSearchHit,
} from "./catalogOfferSearchText";
import {
  sanitizeSourceOfferInput,
  SOURCE_OFFER_SNIPPET_MAX,
} from "./catalogSourceOfferNormalize";
import { searchPublicWebForOffers, searchPublicWebForOffersDeep } from "./catalogSearchProvider";
import type { CatalogSourceName } from "./catalogSourceOfferTypes";

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

export type OfferParseQuality = "full" | "partial" | "search_only";

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
  parsed: number;
  afterCityFilter: number;
  afterPriceFilter: number;
  afterBrandOemFilter: number;
  afterDuplicateFilter: number;
  detailEnriched: number;
  sourceCounts: Partial<Record<OfferListingSourceId | "youla", number>>;
  hidden: Record<string, number>;
  diagnostics: OfferSourceSearchDiagnostic[];
  pagesPerSource: number;
  serpFallbackUsed: boolean;
};

export type OfferSearchResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  emptyReason?: string | null;
  results: OfferSearchResultItem[];
  stats: OfferSearchStats;
};

const DEFAULT_CATEGORY = "drugie";
const MAX_RESULTS = 100;
const DETAIL_ENRICH_CAP = 40;
const PAGES_PER_SOURCE = 3;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function urlMatchesOfferSource(url: string, filter: OfferSearchSourceFilter): boolean {
  if (filter === "all") return true;
  const lower = url.toLowerCase();
  if (filter === "avito") return lower.includes("avito.ru");
  if (filter === "drom") return lower.includes("drom.ru") || lower.includes("auto.ru");
  if (filter === "youla") return lower.includes("youla.ru");
  if (filter === "vk") return lower.includes("vk.com") || lower.includes("vk.ru");
  if (filter === "company_site") {
    return (
      !lower.includes("avito.ru") &&
      !lower.includes("drom.ru") &&
      !lower.includes("auto.ru") &&
      !lower.includes("youla.ru") &&
      !lower.includes("vk.com") &&
      !lower.includes("vk.ru")
    );
  }
  return (
    !lower.includes("avito.ru") &&
    !lower.includes("drom.ru") &&
    !lower.includes("auto.ru") &&
    !lower.includes("youla.ru") &&
    !lower.includes("vk.com") &&
    !lower.includes("vk.ru")
  );
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

function computeParseQuality(item: {
  parsed: boolean;
  price: string | null;
  city: string;
  companyName: string;
  sellerName: string;
  shortSnippet: string;
}): OfferParseQuality {
  if (!item.parsed) return "search_only";
  const hasPrice = Boolean(item.price);
  const hasSeller = Boolean(item.companyName?.trim() || item.sellerName?.trim());
  const hasCity = Boolean(item.city?.trim());
  const hasSnippet = Boolean(item.shortSnippet?.trim() && item.shortSnippet.length > 14);
  if (hasPrice && (hasSeller || hasCity)) return "full";
  if (hasPrice || hasSeller || hasCity || hasSnippet) return "partial";
  return "search_only";
}

function hitToResult(hit: OfferSourceSearchHit): OfferSearchResultItem {
  const item: OfferSearchResultItem = {
    url: hit.url,
    title: sanitizeOfferText(hit.title),
    price: hit.price,
    city: sanitizeOfferText(hit.city),
    companyName: "",
    sellerName: sanitizeOfferText(hit.sellerHint),
    sourceName: hit.sourceName,
    shortSnippet: sanitizeOfferText(hit.snippet || hit.title),
    brand: null,
    oemCodes: [],
    articleCodes: [],
    parsed: false,
    parseQuality: "search_only",
  };
  item.parseQuality = computeParseQuality(item);
  return item;
}

function sanitizeResultItem(item: OfferSearchResultItem): OfferSearchResultItem {
  return {
    ...item,
    title: sanitizeOfferText(item.title),
    city: sanitizeOfferText(item.city),
    companyName: sanitizeOfferText(item.companyName),
    sellerName: sanitizeOfferText(item.sellerName),
    shortSnippet: sanitizeOfferText(item.shortSnippet || item.title),
    parseQuality: computeParseQuality(item),
  };
}

function filterValidResults(
  items: OfferSearchResultItem[],
  hidden: Record<string, number>,
): OfferSearchResultItem[] {
  const out: OfferSearchResultItem[] = [];
  for (const raw of items) {
    const item = sanitizeResultItem(raw);
    if (hasBadEncoding(item.title) || hasBadEncoding(item.shortSnippet)) {
      hidden.bad_encoding = (hidden.bad_encoding ?? 0) + 1;
      continue;
    }
    const src = listingSourceFromUrl(item.url);
    if (src && !isRealOfferListingUrl(item.url, src)) {
      hidden.not_listing = (hidden.not_listing ?? 0) + 1;
      continue;
    }
    if (
      !meetsMinimumOfferFields({
        title: item.title,
        url: item.url,
        price: item.price,
        city: item.city,
        snippet: item.shortSnippet,
        companyName: item.companyName,
        sellerName: item.sellerName,
      })
    ) {
      hidden.insufficient_fields = (hidden.insufficient_fields ?? 0) + 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

function mergeDetail(
  item: OfferSearchResultItem,
  input: {
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
    categorySlug?: string;
  },
): OfferSearchResultItem {
  const sanitized = sanitizeSourceOfferInput({
    title: input.title || item.title,
    price: input.price ?? item.price,
    city: input.city || item.city,
    region: "",
    categorySlug: input.categorySlug ?? "drugie",
    companyName: input.companyName,
    sellerName: input.sellerName,
    brand: input.brand,
    oemCodes: input.oemCodes,
    articleCodes: input.articleCodes,
    sourceName: input.sourceName,
    sourceUrl: item.url,
    shortSnippet: (input.shortSnippet || item.shortSnippet).slice(0, SOURCE_OFFER_SNIPPET_MAX),
    confidenceScore: 0.65,
  });
  if (!sanitized) return item;

  const merged: OfferSearchResultItem = {
    url: item.url,
    title: sanitized.title,
    price: sanitized.price,
    city: sanitized.city,
    companyName: sanitized.companyName,
    sellerName: sanitized.sellerName,
    sourceName: sanitized.sourceName,
    shortSnippet: sanitized.shortSnippet,
    brand: sanitized.brand,
    oemCodes: sanitized.oemCodes,
    articleCodes: sanitized.articleCodes,
    parsed: true,
    parseQuality: "search_only",
  };
  merged.parseQuality = computeParseQuality(merged);
  return merged;
}

function countBySource(items: OfferSearchResultItem[]): OfferSearchStats["sourceCounts"] {
  const counts: OfferSearchStats["sourceCounts"] = { avito: 0, drom: 0, youla: 0, vk: 0 };
  for (const item of items) {
    const u = item.url.toLowerCase();
    if (u.includes("avito.ru")) counts.avito = (counts.avito ?? 0) + 1;
    else if (u.includes("drom.ru") || u.includes("auto.ru")) counts.drom = (counts.drom ?? 0) + 1;
    else if (u.includes("youla.ru")) counts.youla = (counts.youla ?? 0) + 1;
    else if (u.includes("vk.com") || u.includes("vk.ru")) counts.vk = (counts.vk ?? 0) + 1;
  }
  return counts;
}

function matchesCity(item: OfferSearchResultItem, city: string): boolean {
  if (!city.trim()) return true;
  const needle = norm(city);
  const blob = norm(`${item.city} ${item.title} ${item.shortSnippet} ${item.url}`);
  return blob.includes(needle);
}

function matchesBrandOem(
  item: OfferSearchResultItem,
  brand: string,
  oemArticle: string,
): boolean {
  const blob = norm(`${item.title} ${item.shortSnippet} ${item.brand ?? ""} ${item.oemCodes.join(" ")} ${item.articleCodes.join(" ")}`);
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

const SERP_MIN_PER_SOURCE = 8;
const SERP_PAGES = 3;

function urlMatchesListingSource(url: string, source: OfferListingSourceId): boolean {
  const lower = url.toLowerCase();
  if (source === "avito") return lower.includes("avito.ru");
  if (source === "drom") return lower.includes("drom.ru") || lower.includes("auto.ru");
  if (source === "youla") return lower.includes("youla.ru");
  return lower.includes("vk.com") || lower.includes("vk.ru");
}

async function serpFallbackHits(
  query: string,
  sources: OfferListingSourceId[],
  existingBySource: Partial<Record<OfferListingSourceId, number>>,
): Promise<{ hits: OfferSourceSearchHit[]; serpUrlsBySource: Record<string, string[]> }> {
  const hits: OfferSourceSearchHit[] = [];
  const seen = new Set<string>();
  const serpUrlsBySource: Record<string, string[]> = {};

  for (const source of sources) {
    const have = existingBySource[source] ?? 0;
    if (have >= SERP_MIN_PER_SOURCE) continue;

    const serp = await searchPublicWebForOffersDeep({
      query,
      siteKey: source,
      pages: SERP_PAGES,
      perPage: 20,
    });
    if (!serp.ok) continue;
    serpUrlsBySource[source] = serp.queriesUsed;

    for (const c of serp.candidates) {
      const url = c.url;
      if (!urlMatchesListingSource(url, source) || !isRealOfferListingUrl(url, source)) continue;
      const title = sanitizeOfferText(c.title || "");
      const snippet = sanitizeOfferText(c.snippet || title);
      const priceNum = parsePriceNumber(snippet || title);
      const candidate: OfferSourceSearchHit = {
        url,
        title,
        snippet,
        price: priceNum != null ? String(priceNum) : null,
        city: "",
        sellerHint: "",
        sourceName: catalogSourceNameFromUrl(url),
        fromSearchPage: true,
      };
      if (validateOfferSearchHit(candidate, source)) continue;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(candidate);
    }
  }
  return { hits, serpUrlsBySource };
}

function emptyStats(): OfferSearchStats {
  return {
    parsed: 0,
    afterCityFilter: 0,
    afterPriceFilter: 0,
    afterBrandOemFilter: 0,
    afterDuplicateFilter: 0,
    detailEnriched: 0,
    sourceCounts: {},
    hidden: {},
    diagnostics: [],
    pagesPerSource: PAGES_PER_SOURCE,
    serpFallbackUsed: false,
  };
}

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
    const serpOnly = await searchPublicWebForOffers({
      query: [query, brand, oemArticle].filter(Boolean).join(" "),
      limit: 30,
    });
    let items: OfferSearchResultItem[] = (serpOnly.ok ? serpOnly.candidates : [])
      .filter((c) => urlMatchesOfferSource(c.url, sourceFilter))
      .map((c) =>
        hitToResult({
          url: c.url,
          title: c.title,
          snippet: c.snippet,
          price: parsePriceNumber(c.snippet) != null ? String(parsePriceNumber(c.snippet)) : null,
          city: "",
          sellerHint: "",
          sourceName: catalogSourceNameFromUrl(c.url),
          fromSearchPage: true,
        }),
      );

    const stats = emptyStats();
    stats.parsed = items.length;
    stats.serpFallbackUsed = true;

    if (brand || oemArticle) {
      const before = items.length;
      items = items.filter((i) => matchesBrandOem(i, brand, oemArticle));
      if (before > items.length) hidden.brand_oem = before - items.length;
    }
    stats.afterBrandOemFilter = items.length;

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
    stats.afterDuplicateFilter = items.length;
    stats.sourceCounts = countBySource(items);

    return {
      ok: true,
      results: items.slice(0, MAX_RESULTS),
      stats,
      emptyReason: items.length === 0 ? "ALL_FILTERED_SOURCE" : null,
      message: items.length === 0 ? "Нет результатов для выбранного источника" : undefined,
    };
  }

  const sources = offerSourcesForFilter(sourceFilter);
  let { hits, diagnostics } = await searchOfferListingSources({
    query,
    city,
    sources,
    maxPages: PAGES_PER_SOURCE,
    maxTotal: MAX_RESULTS,
  });

  const countBySourceDiag = (): Partial<Record<OfferListingSourceId, number>> => {
    const out: Partial<Record<OfferListingSourceId, number>> = {};
    for (const h of hits) {
      const u = h.url.toLowerCase();
      if (u.includes("avito.ru")) out.avito = (out.avito ?? 0) + 1;
      else if (u.includes("drom.ru") || u.includes("auto.ru")) out.drom = (out.drom ?? 0) + 1;
      else if (u.includes("youla.ru")) out.youla = (out.youla ?? 0) + 1;
      else if (u.includes("vk.com") || u.includes("vk.ru")) out.vk = (out.vk ?? 0) + 1;
    }
    return out;
  };

  let serpFallbackUsed = false;
  const needFallback =
    hits.length < MAX_RESULTS &&
    (hits.length < 15 || diagnostics.some((d) => d.parsedCount < SERP_MIN_PER_SOURCE));

  if (needFallback) {
    const { hits: extra, serpUrlsBySource } = await serpFallbackHits(query, sources, countBySourceDiag());
    if (extra.length > 0) {
      serpFallbackUsed = true;
      const seen = new Set(hits.map((h) => h.url.toLowerCase()));
      for (const h of extra) {
        if (seen.has(h.url.toLowerCase())) continue;
        if (hits.length >= MAX_RESULTS) break;
        seen.add(h.url.toLowerCase());
        hits.push(h);
      }
      for (const d of diagnostics) {
        const serpQ = serpUrlsBySource[d.sourceName];
        if (serpQ?.length) {
          d.searchUrls.push(...serpQ.map((q) => `SERP: ${q}`));
        }
        const n = extra.filter((e) => urlMatchesListingSource(e.url, d.sourceName)).length;
        if (n > 0) {
          d.parsedCount += n;
          d.zeroReason = null;
          d.message = d.message ?? "дополнено через SERP (до 3 стр.)";
        }
      }
    }
  }

  let items: OfferSearchResultItem[] = hits.map(hitToResult);
  const stats: OfferSearchStats = {
    parsed: items.length,
    afterCityFilter: 0,
    afterPriceFilter: 0,
    afterBrandOemFilter: 0,
    afterDuplicateFilter: 0,
    detailEnriched: 0,
    sourceCounts: {},
    hidden,
    diagnostics,
    pagesPerSource: PAGES_PER_SOURCE,
    serpFallbackUsed,
  };

  if (items.length === 0) {
    const reasons = diagnostics
      .filter((d) => d.zeroReason)
      .map((d) => `${d.sourceName}: ${d.zeroReason}`)
      .join("; ");
    return {
      ok: true,
      results: [],
      stats,
      emptyReason: diagnostics.every((d) => d.zeroReason === "blocked" || d.zeroReason === "captcha") ?
        "SOURCE_BLOCKED"
      : "NO_RAW_RESULTS",
      message: reasons || "Источники не вернули объявлений",
    };
  }

  logCatalogDiscover("offer_search_enrich", { count: Math.min(items.length, DETAIL_ENRICH_CAP) });
  const enrichUrls = items.slice(0, DETAIL_ENRICH_CAP).map((i) => i.url);
  const { previews } = await previewSourceOffersFromUrls(enrichUrls, {
    categorySlug: DEFAULT_CATEGORY,
    city: "",
  });
  stats.detailEnriched = previews.length;
  const previewByUrl = new Map(previews.map((p) => [p.url.trim().toLowerCase(), p.input]));
  items = items.map((item) => {
    const input = previewByUrl.get(item.url.trim().toLowerCase());
    if (!input) return item;
    return mergeDetail(item, {
      title: input.title,
      price: input.price,
      city: input.city,
      companyName: input.companyName,
      sellerName: input.sellerName,
      sourceName: input.sourceName,
      shortSnippet: input.shortSnippet,
      brand: input.brand,
      oemCodes: input.oemCodes,
      articleCodes: input.articleCodes,
      categorySlug: DEFAULT_CATEGORY,
    });
  });

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
  items = filterValidResults(items, hidden);
  if (beforeQuality > items.length) {
    logCatalogDiscover("offer_search_quality_filter", {
      dropped: beforeQuality - items.length,
      hidden,
    });
  }

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
        `После разбора: ${stats.parsed} → город: ${stats.afterCityFilter} → цена: ${stats.afterPriceFilter}${brand || oemArticle ? ` → бренд/OEM: ${stats.afterBrandOemFilter}` : ""}`
      : undefined,
  };
}
