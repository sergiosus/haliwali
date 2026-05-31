import { detectDiscoverySourceType } from "./catalogDiscoverSourceType";
import { classifySourceUrl } from "./catalogSourceClassifier";
import { logCatalogDiscover } from "./catalogCatalogLog";
import { previewSourceOffersFromUrls } from "./catalogSourceOfferExtractionService";
import { catalogSourceNameFromUrl } from "./catalogSourceName";
import { searchPublicWeb, type SearchCandidate } from "./catalogSearchProvider";
import type { CatalogSourceName } from "./catalogSourceOfferTypes";

export type OfferSearchSourceFilter =
  | "all"
  | "avito"
  | "drom"
  | "youla"
  | "vk"
  | "company_site"
  | "other";

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
};

export type OfferSearchStats = {
  rawFromProvider: number;
  listingUrls: number;
  afterSourceFilter: number;
  afterTextFilter: number;
  afterPriceFilter: number;
  previewParsed: number;
  previewFailed: number;
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
const PREVIEW_CAP = 50;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function isOfferListingUrl(url: string): boolean {
  try {
    return classifySourceUrl(new URL(url.startsWith("http") ? url : `https://${url}`)) === "listing";
  } catch {
    return false;
  }
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

function isOfferSearchCandidate(c: SearchCandidate): boolean {
  if (isOfferListingUrl(c.url)) return true;
  const t = detectDiscoverySourceType(c.domain, c.url, c.title);
  if (t === "listing") return true;
  if (t === "vk_group" && /\/(wall|market|product|item)/i.test(c.url)) return true;
  return false;
}

function parsePriceNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/([0-9][0-9\s\u00a0]{2,12})/);
  if (!m?.[1]) return null;
  const digits = m[1].replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function serpItemToPreview(c: SearchCandidate, cityDefault: string): OfferSearchResultItem {
  const sourceName = catalogSourceNameFromUrl(c.url);
  const priceNum = parsePriceNumber(c.snippet);
  return {
    url: c.url,
    title: c.title || c.url,
    price: priceNum != null ? String(priceNum) : null,
    city: cityDefault,
    companyName: "",
    sellerName: "",
    sourceName,
    shortSnippet: c.snippet,
    brand: null,
    oemCodes: [],
    articleCodes: [],
    parsed: false,
  };
}

function mergePreview(serp: OfferSearchResultItem, input: {
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
}): OfferSearchResultItem {
  return {
    url: serp.url,
    title: input.title || serp.title,
    price: input.price ?? serp.price,
    city: input.city || serp.city,
    companyName: input.companyName,
    sellerName: input.sellerName,
    sourceName: input.sourceName,
    shortSnippet: input.shortSnippet || serp.shortSnippet,
    brand: input.brand,
    oemCodes: input.oemCodes,
    articleCodes: input.articleCodes,
    parsed: true,
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
  const searchQuery = [query, brand, oemArticle].filter(Boolean).join(" ");

  const result = await searchPublicWeb({
    query: searchQuery,
    city,
    categorySlug: DEFAULT_CATEGORY,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      message:
        result.error === "SEARCH_PROVIDER_NONE" ?
          "Поиск не настроен (SEARCH_PROVIDER / SEARCH_API_KEY)"
        : "Ошибка поискового API",
      results: [],
      stats: emptyStats(),
      emptyReason: result.error === "SEARCH_PROVIDER_NONE" ? "SEARCH_PROVIDER_NONE" : "SEARCH_FAILED",
    };
  }

  const stats: OfferSearchStats = {
    rawFromProvider: result.candidates.length,
    listingUrls: 0,
    afterSourceFilter: 0,
    afterTextFilter: 0,
    afterPriceFilter: 0,
    previewParsed: 0,
    previewFailed: 0,
  };

  const listing = result.candidates.filter(isOfferSearchCandidate);
  stats.listingUrls = listing.length;

  if (listing.length === 0) {
    return {
      ok: true,
      results: [],
      stats,
      emptyReason:
        result.candidates.length === 0 ? "NO_RAW_RESULTS" : "ALL_FILTERED_NOT_LISTING",
      message:
        result.candidates.length === 0 ?
          "Поисковый API не вернул ссылок"
        : "Все ссылки отфильтрованы: нет объявлений с площадок (Avito, Drom, Youla и др.)",
    };
  }

  let filtered = listing.filter((c) => urlMatchesOfferSource(c.url, sourceFilter));
  stats.afterSourceFilter = filtered.length;

  if (filtered.length === 0) {
    return {
      ok: true,
      results: [],
      stats,
      emptyReason: "ALL_FILTERED_SOURCE",
      message: `Нет результатов для выбранного источника (${sourceFilter})`,
    };
  }

  if (brand || oemArticle) {
    const blobNeedle = norm([brand, oemArticle].filter(Boolean).join(" "));
    filtered = filtered.filter((c) => {
      const blob = norm(`${c.title} ${c.snippet}`);
      if (brand && !blob.includes(norm(brand))) return false;
      if (oemArticle && !blob.includes(norm(oemArticle))) return false;
      return true;
    });
  }
  stats.afterTextFilter = filtered.length;

  if (filtered.length === 0 && (brand || oemArticle)) {
    return {
      ok: true,
      results: [],
      stats,
      emptyReason: "ALL_FILTERED_BRAND_OEM",
      message: "Нет совпадений по бренду или OEM/артикулу в заголовке сниппета",
    };
  }

  const priceMin = opts.priceMin;
  const priceMax = opts.priceMax;
  if (priceMin != null || priceMax != null) {
    filtered = filtered.filter((c) => {
      const p = parsePriceNumber(c.snippet);
      if (p == null) return true;
      if (priceMin != null && p < priceMin) return false;
      if (priceMax != null && p > priceMax) return false;
      return true;
    });
  }
  stats.afterPriceFilter = filtered.length;

  if (filtered.length === 0 && (priceMin != null || priceMax != null)) {
    return {
      ok: true,
      results: [],
      stats,
      emptyReason: "ALL_FILTERED_PRICE",
      message: "Нет результатов в указанном диапазоне цен (по данным сниппета)",
    };
  }

  const serpItems = filtered.map((c) => serpItemToPreview(c, city));
  const toPreview = serpItems.slice(0, PREVIEW_CAP);
  const previewUrls = toPreview.map((x) => x.url);

  logCatalogDiscover("offer_search_preview", { count: previewUrls.length });

  const { previews, errors } = await previewSourceOffersFromUrls(previewUrls, {
    categorySlug: DEFAULT_CATEGORY,
    city,
  });

  stats.previewParsed = previews.length;
  stats.previewFailed = errors.length;

  const previewByUrl = new Map(previews.map((p) => [p.url.trim().toLowerCase(), p.input]));

  const results: OfferSearchResultItem[] = serpItems.map((serp) => {
    const input = previewByUrl.get(serp.url.trim().toLowerCase());
    if (!input) return serp;
    return mergePreview(serp, {
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
    });
  });

  return {
    ok: true,
    results,
    stats,
    emptyReason: null,
  };
}

function emptyStats(): OfferSearchStats {
  return {
    rawFromProvider: 0,
    listingUrls: 0,
    afterSourceFilter: 0,
    afterTextFilter: 0,
    afterPriceFilter: 0,
    previewParsed: 0,
    previewFailed: 0,
  };
}
