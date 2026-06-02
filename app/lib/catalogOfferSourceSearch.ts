/**
 * Direct marketplace search for admin offer import (Avito, Drom, Youla, VK).
 * Fetches search result pages — not company discover / SERP.
 */

import {
  logCatalogDiscover,
  logCatalogOfferSearch,
  logOfferSearchHtmlSnippet,
} from "./catalogCatalogLog";
import { assertCatalogFetchAllowed } from "./catalogHtmlFetch";
import {
  isBroadUnrelatedResultSet,
  offerHasUnrelatedAutoBrand,
  offerMatchesSearchQueryStrict,
} from "./catalogOfferSearchRelevance";
import { buildAutoRuSearchUrls, parseAutoRuSearchHtml } from "./catalogOfferAutoRuParser";
import {
  decodeHtmlBytes,
  decodeJsonString,
  extractCityFromContext,
  extractDromCardTitle,
  extractPriceFromBlob,
  extractSellerFromContext,
  isRealOfferListingUrl,
  sanitizeOfferText,
  titleFromListingUrl,
  validateOfferLinkFromSearchPage,
} from "./catalogOfferSearchText";
import { parseListingPriceFromContext } from "./catalogOfferPrice";
import { extractAvitoListingThumbnail } from "./catalogSourceOfferCoverImage";
import { assertPublicResolvableHost } from "./catalogUrlSafety";
import { slugifyCatalogText } from "./catalogSlug";
import {
  CATALOG_MARKETPLACE_SOURCES,
  type OfferListingSourceId,
} from "./catalogSourceOfferTypes";

export type { OfferListingSourceId } from "./catalogSourceOfferTypes";
export { CATALOG_MARKETPLACE_SOURCES } from "./catalogSourceOfferTypes";

export type OfferSourceZeroReason =
  | "blocked"
  | "captcha"
  | "no_selector"
  | "empty_response"
  | "fetch_error"
  | "parse_error"
  | "unsupported"
  | "disabled"
  | "city_unsupported"
  | "catalog_only"
  | "js_shell"
  | "source_unreliable_for_query"
  | null;

/** Non-automotive «all» search (Avito + Drom). Automotive uses routing in catalogOfferAutoRouting. */
export const STABLE_OFFER_SEARCH_SOURCES: OfferListingSourceId[] = ["avito", "drom"];

export const AUTOMOTIVE_OFFER_SEARCH_SOURCES: OfferListingSourceId[] = ["avito", "auto_ru"];

export type OfferSourceSearchDiagnostic = {
  sourceName: OfferListingSourceId;
  searched: boolean;
  blocked: boolean;
  /** Direct marketplace search URLs opened (not Google/Bing). */
  searchUrls: string[];
  httpStatus: number | null;
  /** Search result pages fetched. */
  pagesScanned: number;
  /** Listing links extracted from SERP HTML. */
  linksExtracted: number;
  /** After query relevance filter (filled by admin search). */
  relevantCount?: number;
  /** Rejected by query relevance filter (filled by admin search). */
  rejectedByRelevance?: number;
  skippedCount: number;
  parserErrors: number;
  zeroReason: OfferSourceZeroReason;
  skipReasons: Record<string, number>;
  message?: string;
  /** Last fetch/parse exception for this source. */
  errorMessage?: string | null;
  errorCode?: string | null;
  lastRequestUrl?: string | null;
};

export type OfferSourceSearchHit = {
  url: string;
  title: string;
  snippet: string;
  price: string | null;
  priceAmount?: number | null;
  priceText?: string | null;
  city: string;
  sellerHint: string;
  sourceName: OfferListingSourceId;
  fromSearchPage: boolean;
  /** @deprecated use coverImageUrl */
  imageUrl?: string | null;
  coverImageUrl?: string | null;
  offerType?: import("./catalogSourceOfferType").CatalogSourceOfferType;
  year?: number | null;
  mileageKm?: number | null;
  /** SERP card has enough fields to create a draft without opening the listing. */
  cardComplete?: boolean;
};

const MAX_PAGES_PER_SOURCE = 3;
const MAX_TOTAL_HITS = 100;
const FETCH_TIMEOUT_MS = 12_000;

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function sourceUserAgent(id: OfferListingSourceId): string {
  if (id === "avito" || id === "youla") return MOBILE_UA;
  if (id === "vk" || id === "drom" || id === "auto_ru") return BROWSER_UA;
  return MOBILE_UA;
}

function citySlug(city: string): string | null {
  const slug = slugifyCatalogText(city);
  return slug.length >= 2 ? slug : null;
}

function isCaptchaOrBlocked(html: string, status: number): boolean {
  if (status === 403 || status === 401 || status === 429) return true;
  const head = html.slice(0, 14_000).toLowerCase();
  return (
    head.includes("captcha") ||
    head.includes("cf-challenge") ||
    head.includes("доступ ограничен") ||
    head.includes("access denied") ||
    head.includes("servicepipe") ||
    head.includes("perimeterx") ||
    (head.includes("робот") && head.includes("подтверд"))
  );
}

async function fetchSearchPage(
  rawUrl: string,
  source: OfferListingSourceId,
): Promise<
  | { ok: true; status: number; html: string; url: string }
  | { ok: false; status: number | null; error: string; errorMessage?: string }
> {
  let url: URL;
  try {
    url = assertCatalogFetchAllowed(rawUrl);
    await assertPublicResolvableHost(url);
  } catch {
    return { ok: false, status: null, error: "INVALID_URL" };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "User-Agent": sourceUserAgent(source),
      },
      cache: "no-store",
    });
    const status = res.status;
    if (!res.ok) {
      return { ok: false, status, error: status === 403 || status === 429 ? "BLOCKED" : "HTTP_ERROR" };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 80) return { ok: false, status, error: "EMPTY_RESPONSE" };
    const html = decodeHtmlBytes(buf, res.headers.get("content-type"));
    if (isCaptchaOrBlocked(html, status)) {
      return { ok: false, status, error: "CAPTCHA" };
    }
    return { ok: true, status, html, url: url.toString() };
  } catch {
    return { ok: false, status: null, error: "FETCH_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeListingUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Item id is the last `_digits` segment (ignore mileage like `_470_000_km`). */
function avitoItemIdFromPath(path: string): string | null {
  const cleaned = path.replace(/\\\//g, "/").split("?")[0] ?? "";
  const m = cleaned.match(/_(\d{8,})$/);
  return m?.[1] ?? null;
}

function avitoListingUrlFromPath(path: string, baseUrl: string): string | null {
  const cleaned = path.replace(/\\\//g, "/").split("?")[0] ?? "";
  if (!avitoItemIdFromPath(cleaned)) return null;
  if (/\/(add|search|catalog|brands|profile)\b/i.test(cleaned)) return null;
  const rel = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  const url = normalizeListingUrl(`https://www.avito.ru${rel}`, baseUrl);
  return url && isRealOfferListingUrl(url, "avito") ? url : null;
}

function htmlHasAvitoListingSignals(html: string): boolean {
  return (
    /href="\/[^"]+_\d{8,}"/i.test(html) ||
    /"urlPath"\s*:\s*"\/[^"]+_\d{8,}"/i.test(html) ||
    /https?:\/\/(?:www\.)?avito\.ru\/[^"\s<>]+_\d{8,}/i.test(html)
  );
}

function pushAvitoHit(
  hits: OfferSourceSearchHit[],
  seen: Set<string>,
  rawUrl: string,
  baseUrl: string,
  cityDefault: string,
  titleHint: string,
  ctx: string,
): OfferSourceSearchHit | null {
  const url = normalizeListingUrl(rawUrl, baseUrl);
  if (!url || !isRealOfferListingUrl(url, "avito") || seen.has(url)) return null;
  seen.add(url);
  const title = sanitizeOfferText(
    titleHint ||
      decodeJsonString(
        ctx.match(/data-marker="item-title"[^>]*>([^<]{4,200})</i)?.[1] ??
          ctx.match(/itemprop="name"[^>]*content="([^"]{4,200})"/i)?.[1] ??
          ctx.match(/"title"\s*:\s*"([^"]{4,200})"/i)?.[1] ??
          ctx.match(/"name"\s*:\s*"([^"]{4,200})"/i)?.[1] ??
          "",
      ) ||
      titleFromListingUrl(url) ||
      "",
  );
  const priceFields = parseListingPriceFromContext(ctx);
  const coverImageUrl = extractAvitoListingThumbnail(ctx);
  const snippet = sanitizeOfferText(
    decodeJsonString(ctx.match(/"description"\s*:\s*"([^"]{8,280})"/i)?.[1] ?? "") ||
      decodeJsonString(ctx.match(/data-marker="item-description"[^>]*>([^<]{8,280})/i)?.[1] ?? "") ||
      title,
  );
  const hit: OfferSourceSearchHit = {
    url,
    title: title.slice(0, 200),
    snippet: snippet.slice(0, 280),
    price: priceFields.price,
    priceAmount: priceFields.priceAmount,
    priceText: priceFields.priceText,
    coverImageUrl,
    city: sanitizeOfferText(extractCityFromContext(ctx) || cityDefault),
    sellerHint: extractSellerFromContext(ctx),
    sourceName: "avito",
    fromSearchPage: true,
    cardComplete: Boolean(
      title.length >= 4 && priceFields.priceAmount && (coverImageUrl || snippet.length >= 8),
    ),
  };
  if (validateOfferLinkFromSearchPage(hit, "avito")) return null;
  hits.push(hit);
  return hit;
}

function isAvitoSearchBlocked(html: string, extracted: number): boolean {
  if (extracted > 0) return false;
  const sample = html.slice(0, 30_000).toLowerCase();
  if (
    sample.includes("captcha") ||
    sample.includes("firewall") ||
    sample.includes("доступ ограничен") ||
    sample.includes("servicepipe") ||
    sample.includes("perimeterx")
  ) {
    return true;
  }
  if (htmlHasAvitoListingSignals(html)) return false;
  return html.length < 50_000;
}

type AvitoParseMeta = { jsShell: boolean; blocked: boolean };

function parseAvitoSearchHtml(
  html: string,
  baseUrl: string,
  cityDefault: string,
): { hits: OfferSourceSearchHit[]; meta: AvitoParseMeta } {
  const hits: OfferSourceSearchHit[] = [];
  const seen = new Set<string>();

  const absRe = /https?:\/\/(?:www\.)?avito\.ru\/[^"\s<>]+_\d{8,}(?:\?|"|#|\s|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = absRe.exec(html)) !== null) {
    const raw = m[0]!.replace(/["#\s]+$/, "");
    pushAvitoHit(hits, seen, raw, baseUrl, cityDefault, "", html.slice(Math.max(0, m.index - 200), m.index + 600));
  }

  const hrefRe = /href="(\/[^"?#]+?_\d{8,})(?:\?|"|#)/gi;
  while ((m = hrefRe.exec(html)) !== null) {
    const built = avitoListingUrlFromPath(m[1]!, baseUrl);
    if (built) {
      const title =
        decodeJsonString(
          html.slice(m.index, m.index + 800).match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "",
        ) || "";
      pushAvitoHit(hits, seen, built, baseUrl, cityDefault, title, html.slice(m.index, m.index + 500));
    }
  }

  const pathRe = /"urlPath"\s*:\s*"(\/[^"\\]+_\d{8,}[^"\\]*)"/gi;
  while ((m = pathRe.exec(html)) !== null) {
    const built = avitoListingUrlFromPath(m[1]!, baseUrl);
    if (built) {
      const title =
        decodeJsonString(
          html.slice(m.index, m.index + 800).match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "",
        ) || "";
      pushAvitoHit(hits, seen, built, baseUrl, cityDefault, title, html.slice(m.index, m.index + 500));
    }
  }

  const itemRe =
    /"id"\s*:\s*(\d{8,})[\s\S]{0,500}?"title"\s*:\s*"([^"]{3,200})"[\s\S]{0,500}?"urlPath"\s*:\s*"([^"]+)"/gi;
  while ((m = itemRe.exec(html)) !== null) {
    const built = avitoListingUrlFromPath(m[3]!, baseUrl);
    if (built) pushAvitoHit(hits, seen, built, baseUrl, cityDefault, decodeJsonString(m[2]!), m[0]!);
  }

  const blocked = isAvitoSearchBlocked(html, hits.length);
  const jsShell = hits.length === 0 && html.length > 100_000 && !htmlHasAvitoListingSignals(html);
  return { hits, meta: { jsShell, blocked } };
}

export function diagnoseAvitoSearchPage(
  html: string,
  hits: OfferSourceSearchHit[],
  meta?: AvitoParseMeta,
): string | null {
  if (hits.length > 0) return null;
  if (meta?.blocked || isAvitoSearchBlocked(html, 0)) return "Avito blocked search page.";
  if (meta?.jsShell) return "Avito: список объявлений не в HTML (нужна мобильная выдача).";
  return "На странице поиска Avito нет ссылок на объявления в HTML.";
}

type DromParseMeta = {
  catalogOnly: boolean;
  jsShell: boolean;
  sourceUnreliableForQuery: boolean;
};

function pushDromHit(
  hits: OfferSourceSearchHit[],
  seen: Set<string>,
  rawUrl: string,
  baseUrl: string,
  cityDefault: string,
  ctx: string,
): void {
  const url = normalizeListingUrl(rawUrl, baseUrl);
  if (!url || !isRealOfferListingUrl(url, "drom") || seen.has(url)) return;
  seen.add(url);
  const title = sanitizeOfferText(
    extractDromCardTitle(ctx, url) ||
      decodeJsonString(ctx.match(/"title"\s*:\s*"([^"]{4,200})"/i)?.[1] ?? "") ||
      titleFromListingUrl(url) ||
      "",
  );
  const snippet = sanitizeOfferText(
    decodeJsonString(ctx.match(/"description"\s*:\s*"([^"]{8,280})"/i)?.[1] ?? "") || title,
  );
  const hit: OfferSourceSearchHit = {
    url,
    title: title.slice(0, 200),
    snippet: snippet.slice(0, 280),
    price: extractPriceFromBlob(ctx),
    city: sanitizeOfferText(extractCityFromContext(ctx) || cityDefault),
    sellerHint: extractSellerFromContext(ctx),
    sourceName: "drom",
    fromSearchPage: true,
  };
  if (validateOfferLinkFromSearchPage(hit, "drom")) return;
  hits.push(hit);
}

function parseDromSearchHtml(
  html: string,
  baseUrl: string,
  cityDefault: string,
  query: string,
): { hits: OfferSourceSearchHit[]; meta: DromParseMeta } {
  const hits: OfferSourceSearchHit[] = [];
  const seen = new Set<string>();
  let catalogHits = 0;

  const patterns: RegExp[] = [
    /https?:\/\/auto\.drom\.ru\/[a-z0-9_./%-]+\d{6,}\.html/gi,
    /https?:\/\/baza\.drom\.ru\/[a-z0-9_./%-]+\d{5,}(?:\.html)?/gi,
    /href="(https?:\/\/auto\.drom\.ru\/[^"]+\d{6,}\.html)"/gi,
    /href="(\/[^"?#]+\d{6,}\.html)"/gi,
    /data-ftid="bulls-list_bull"[\s\S]{0,1200}?href="([^"]+\d{6,}\.html)"/gi,
  ];

  for (const urlRe of patterns) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const raw = m[1] ?? m[0]!;
      if (/\/catalog(\/|$)/i.test(raw)) {
        catalogHits += 1;
        continue;
      }
      const ctx = html.slice(Math.max(0, m.index - 500), m.index + 900);
      pushDromHit(hits, seen, raw, baseUrl, cityDefault, ctx);
    }
  }

  const jsShell =
    hits.length === 0 &&
    (/bulls-list|sales-bull-page|data-bull-id/i.test(html) ||
      (/\/catalog\//i.test(html) && !/\d{6,}\.html/i.test(html)));
  const catalogOnly = hits.length === 0 && catalogHits > 0 && !jsShell;

  const q = query.trim();
  let sourceUnreliableForQuery = false;
  let filtered = hits;
  if (q.length >= 2) {
    const relevanceFields = hits.map((h) => ({
      ...h,
      shortSnippet: h.snippet,
      brand: null as string | null,
    }));
    if (isBroadUnrelatedResultSet(q, relevanceFields)) {
      sourceUnreliableForQuery = true;
      filtered = [];
    } else {
      filtered = hits.filter((h) => {
        const fields = {
          title: h.title,
          shortSnippet: h.snippet,
          url: h.url,
          brand: null as string | null,
        };
        if (offerHasUnrelatedAutoBrand(q, fields)) return false;
        return offerMatchesSearchQueryStrict(q, fields, { allowUrlFallback: true });
      });
      if (hits.length >= 4 && filtered.length === 0) {
        sourceUnreliableForQuery = true;
      }
    }
  }

  return {
    hits: sourceUnreliableForQuery ? [] : filtered,
    meta: { catalogOnly, jsShell, sourceUnreliableForQuery },
  };
}

export function diagnoseDromSearchPage(meta: DromParseMeta, hits: OfferSourceSearchHit[]): string | null {
  if (hits.length > 0) return null;
  if (meta.sourceUnreliableForQuery) {
    return "Drom: выдача не соответствует запросу (широкий нерелевантный список).";
  }
  if (meta.catalogOnly) return "Drom returned catalog pages, no real offers.";
  if (meta.jsShell) return "Drom: объявления подгружаются скриптом, ссылок в HTML нет.";
  return "На странице поиска Drom нет ссылок на объявления.";
}

function parseYoulaSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const urlRe = /https?:\/\/youla\.ru\/[a-z0-9_./-]+/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    const url = normalizeListingUrl(m[0]!, baseUrl);
    if (!url || !isRealOfferListingUrl(url, "youla") || seen.has(url)) continue;
    seen.add(url);
    const ctx = html.slice(Math.max(0, m.index - 200), m.index + 600);
    const title = sanitizeOfferText(
      decodeJsonString(ctx.match(/"name"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "") ||
        decodeJsonString(ctx.match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "") ||
        titleFromListingUrl(url) ||
        "",
    );
    const snippet = sanitizeOfferText(
      decodeJsonString(ctx.match(/"description"\s*:\s*"([^"]{8,280})"/i)?.[1] ?? "") || title,
    );
    const hit: OfferSourceSearchHit = {
      url,
      title: title.slice(0, 200),
      snippet: snippet.slice(0, 280),
      price: extractPriceFromBlob(ctx),
      city: sanitizeOfferText(extractCityFromContext(ctx) || cityDefault),
      sellerHint: extractSellerFromContext(ctx),
      sourceName: "youla",
      fromSearchPage: true,
    };
    if (validateOfferLinkFromSearchPage(hit, "youla")) continue;
    hits.push(hit);
  }
  return hits;
}

function parseVkSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const patterns = [
    /https?:\/\/vk\.(?:com|ru)\/(?:market\/product[^"'<\s]+|market\/-?\d+[^"'<\s]*)/gi,
    /href="(\/market\/product[^"]+)"/gi,
    /href="(https?:\/\/vk\.(?:com|ru)\/market\/[^"]+)"/gi,
  ];
  const seen = new Set<string>();
  for (const urlRe of patterns) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const raw = m[1] ?? m[0]!;
      const url = normalizeListingUrl(raw, baseUrl);
      if (!url || !isRealOfferListingUrl(url, "vk") || seen.has(url)) continue;
      seen.add(url);
      const ctx = html.slice(Math.max(0, m.index - 300), m.index + 500);
      const title = sanitizeOfferText(
        decodeJsonString(ctx.match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "") ||
          titleFromListingUrl(url) ||
          "",
      );
      const snippet = sanitizeOfferText(
        decodeJsonString(ctx.match(/"description"\s*:\s*"([^"]{8,280})"/i)?.[1] ?? "") || title,
      );
      const hit: OfferSourceSearchHit = {
        url,
        title: title.slice(0, 200),
        snippet: snippet.slice(0, 280),
        price: extractPriceFromBlob(ctx),
        city: sanitizeOfferText(extractCityFromContext(ctx) || cityDefault),
        sellerHint: extractSellerFromContext(ctx),
        sourceName: "vk",
        fromSearchPage: true,
      };
      if (validateOfferLinkFromSearchPage(hit, "vk")) continue;
      hits.push(hit);
    }
  }
  return hits;
}

/** Page-1 direct search URLs per marketplace (no search-engine APIs). */
export function buildDirectMarketplaceSearchUrls(
  query: string,
  city: string,
  sources: OfferListingSourceId[],
): Record<OfferListingSourceId, string[]> {
  const out = {} as Record<OfferListingSourceId, string[]>;
  for (const source of sources) {
    out[source] = buildSearchUrls(source, query, city, 1).urls;
  }
  return out;
}

function buildSearchUrls(
  source: OfferListingSourceId,
  query: string,
  city: string,
  page: number,
): { urls: string[]; cityInUrl: boolean } {
  const q = encodeURIComponent(query.trim());
  const slug = city ? citySlug(city) : null;

  if (source === "avito") {
    const base =
      slug ?
        `https://www.avito.ru/${slug}/all?q=${q}`
      : `https://www.avito.ru/all?q=${q}`;
    const url = page <= 1 ? base : `${base}&p=${page}`;
    return { urls: [url], cityInUrl: Boolean(slug) };
  }

  if (source === "drom") {
    const auto = `https://auto.drom.ru/all/?query=${q}`;
    const baza = `https://baza.drom.ru/sell_spare_parts/search/?query=${q}`;
    const url = page <= 1 ? auto : `${auto}&page=${page}`;
    const alt = page <= 1 ? baza : `${baza}&page=${page}`;
    return { urls: page === 1 ? [url, alt] : [url], cityInUrl: false };
  }

  if (source === "youla") {
    const base =
      slug ?
        `https://youla.ru/${slug}?q=${q}`
      : `https://youla.ru/search?q=${q}`;
    const url = page <= 1 ? base : `${base}&page=${page}`;
    return { urls: [url], cityInUrl: Boolean(slug) };
  }

  if (source === "vk") {
    const base = `https://vk.com/market?section=search&q=${q}`;
    const url = page <= 1 ? base : `${base}&offset=${(page - 1) * 40}`;
    return { urls: [url], cityInUrl: false };
  }

  return { urls: [], cityInUrl: false };
}

type ParseSearchResult = {
  hits: OfferSourceSearchHit[];
  dromMeta?: DromParseMeta;
  avitoMeta?: AvitoParseMeta;
};

function parseSearchHtml(
  source: OfferListingSourceId,
  html: string,
  baseUrl: string,
  cityDefault: string,
  query: string,
): ParseSearchResult {
  if (source === "avito") {
    const { hits, meta } = parseAvitoSearchHtml(html, baseUrl, cityDefault);
    return { hits, avitoMeta: meta };
  }
  if (source === "drom") {
    const { hits, meta } = parseDromSearchHtml(html, baseUrl, cityDefault, query);
    return { hits, dromMeta: meta };
  }
  if (source === "auto_ru") {
    return { hits: parseAutoRuSearchHtml(html, baseUrl, cityDefault) };
  }
  if (source === "youla") return { hits: parseYoulaSearchHtml(html, baseUrl, cityDefault) };
  return { hits: parseVkSearchHtml(html, baseUrl, cityDefault) };
}

function disabledSourceDiagnostic(
  source: OfferListingSourceId,
  zeroReason: OfferSourceZeroReason,
  message: string,
): OfferSourceSearchDiagnostic {
  return {
    sourceName: source,
    searched: false,
    blocked: zeroReason === "captcha",
    searchUrls: [],
    httpStatus: null,
    pagesScanned: 0,
    linksExtracted: 0,
    skippedCount: 0,
    parserErrors: 0,
    zeroReason,
    skipReasons: {},
    message,
    errorMessage: message,
    errorCode: zeroReason,
    lastRequestUrl: null,
  };
}

function zeroReasonFromError(error: string, parsed: number): OfferSourceZeroReason {
  if (parsed > 0) return null;
  if (error === "CAPTCHA") return "captcha";
  if (error === "BLOCKED") return "blocked";
  if (error === "EMPTY_RESPONSE") return "empty_response";
  if (error === "FETCH_ERROR" || error === "HTTP_ERROR") return "fetch_error";
  if (error === "INVALID_URL") return "unsupported";
  return "no_selector";
}

export function offerSourcesForFilter(
  filter: "all" | OfferListingSourceId | "company_site" | "other",
): OfferListingSourceId[] {
  if (filter === "avito") return ["avito"];
  if (filter === "auto_ru") return ["auto_ru"];
  if (filter === "drom") return ["drom"];
  if (filter === "youla") return ["youla"];
  if (filter === "vk") return ["vk"];
  if (filter === "all") return [...STABLE_OFFER_SEARCH_SOURCES];
  return [];
}

export function offerSourcesForAutomotiveAll(): OfferListingSourceId[] {
  return [...AUTOMOTIVE_OFFER_SEARCH_SOURCES];
}

/** Sources not fetched in «all» mode — shown as disabled in diagnostics only. */
export function disabledOfferSearchSourcesForFilter(
  filter: "all" | OfferListingSourceId | "company_site" | "other",
): OfferListingSourceId[] {
  if (filter !== "all") return [];
  return CATALOG_MARKETPLACE_SOURCES.filter((s) => !STABLE_OFFER_SEARCH_SOURCES.includes(s));
}

export async function searchOfferListingSources(opts: {
  query: string;
  city?: string;
  sources: OfferListingSourceId[];
  maxPages?: number;
  maxTotal?: number;
}): Promise<{ hits: OfferSourceSearchHit[]; diagnostics: OfferSourceSearchDiagnostic[] }> {
  const query = opts.query.trim();
  const city = (opts.city ?? "").trim();
  const maxPages = opts.maxPages ?? MAX_PAGES_PER_SOURCE;
  const maxTotal = opts.maxTotal ?? MAX_TOTAL_HITS;
  const diagnostics: OfferSourceSearchDiagnostic[] = [];
  const allHits: OfferSourceSearchHit[] = [];
  const globalSeen = new Set<string>();

  logCatalogOfferSearch("search_start", { query: query.slice(0, 60), sources: opts.sources });

  const disabledSources = CATALOG_MARKETPLACE_SOURCES.filter(
    (s) => !opts.sources.includes(s),
  );
  for (const source of disabledSources) {
    if (source === "youla") {
      diagnostics.push(
        disabledSourceDiagnostic(
          "youla",
          "disabled",
          "Youla blocked by captcha (источник отключён).",
        ),
      );
    } else if (source === "vk") {
      diagnostics.push(
        disabledSourceDiagnostic("vk", "unsupported", "VK parser not implemented yet"),
      );
    }
  }

  await Promise.all(
    opts.sources.map(async (source) => {
      try {
      if (source === "vk") {
        diagnostics.push(
          disabledSourceDiagnostic("vk", "unsupported", "VK parser not implemented yet"),
        );
        return;
      }

      const skipReasons: Record<string, number> = {};
      const searchUrls: string[] = [];
      let httpStatus: number | null = null;
      let pagesScanned = 0;
      let linksExtracted = 0;
      let skippedCount = 0;
      let parserErrors = 0;
      let zeroReason: OfferSourceZeroReason = null;
      let lastError = "";
      let lastErrorMessage: string | null = null;
      let lastRequestUrl: string | null = null;
      let lastHtml = "";
      let dromMeta: DromParseMeta | undefined;
      let avitoMeta: AvitoParseMeta | undefined;

      let triedBroad = false;

      for (let page = 1; page <= maxPages; page += 1) {
        if (allHits.length >= maxTotal) break;
        let cityForBuild = city;
        if (page === 1 && triedBroad) cityForBuild = "";
        const { urls, cityInUrl } = buildSearchUrls(source, query, cityForBuild, page);
        if (urls.length === 0) {
          zeroReason = "unsupported";
          break;
        }

        let pageHits: OfferSourceSearchHit[] = [];
        let pageOk = false;

        for (const searchUrl of urls) {
          if (allHits.length >= maxTotal) break;
          searchUrls.push(searchUrl);
          lastRequestUrl = searchUrl;
          logCatalogOfferSearch("source_request", { source, url: searchUrl.slice(0, 160) });
          const fetched = await fetchSearchPage(searchUrl, source);
          if (!fetched.ok) {
            lastError = fetched.error;
            lastErrorMessage = fetched.errorMessage ?? fetched.error;
            httpStatus = fetched.status;
            logCatalogOfferSearch("source_response_error", {
              source,
              httpStatus: fetched.status,
              error: fetched.error,
            });
            if (page === 1) zeroReason = zeroReasonFromError(fetched.error, 0);
            continue;
          }
          httpStatus = fetched.status;
          logCatalogOfferSearch("source_response_ok", {
            source,
            httpStatus: fetched.status,
            htmlBytes: fetched.html.length,
          });
          pagesScanned += 1;
          pageOk = true;
          lastHtml = fetched.html;
          if (source === "avito" || source === "drom" || source === "auto_ru") {
            logOfferSearchHtmlSnippet(source, searchUrl, fetched.html);
          }
          const parsed = parseSearchHtml(source, fetched.html, fetched.url, city, query);
          if (parsed.dromMeta) {
            dromMeta = dromMeta
              ? {
                  catalogOnly: dromMeta.catalogOnly || parsed.dromMeta.catalogOnly,
                  jsShell: dromMeta.jsShell || parsed.dromMeta.jsShell,
                  sourceUnreliableForQuery:
                    dromMeta.sourceUnreliableForQuery || parsed.dromMeta.sourceUnreliableForQuery,
                }
              : parsed.dromMeta;
          }
          if (parsed.avitoMeta) {
            avitoMeta = avitoMeta
              ? {
                  blocked: avitoMeta.blocked || parsed.avitoMeta.blocked,
                  jsShell: avitoMeta.jsShell || parsed.avitoMeta.jsShell,
                }
              : parsed.avitoMeta;
          }
          pageHits.push(...parsed.hits);
          if (parsed.hits.length > 0) break;
        }

        if (!pageOk && page === 1) break;

        if (pageHits.length === 0) {
          lastError = "NO_SELECTOR";
          if (page === 1 && cityInUrl && city && !triedBroad) {
            triedBroad = true;
            zeroReason = "city_unsupported";
            page -= 1;
            continue;
          }
          if (page === 1 && !cityInUrl && city) zeroReason = "city_unsupported";
          break;
        }

        let newOnPage = 0;
        for (const rawHit of pageHits) {
          const skip = validateOfferLinkFromSearchPage(rawHit, source);
          if (skip) {
            skippedCount += 1;
            parserErrors += 1;
            skipReasons[skip] = (skipReasons[skip] ?? 0) + 1;
            continue;
          }
          const hit: OfferSourceSearchHit = {
            ...rawHit,
            title: sanitizeOfferText(rawHit.title),
            snippet: sanitizeOfferText(rawHit.snippet || rawHit.title),
          };
          const key = hit.url.toLowerCase();
          if (globalSeen.has(key)) {
            skippedCount += 1;
            skipReasons.duplicate = (skipReasons.duplicate ?? 0) + 1;
            continue;
          }
          if (allHits.length >= maxTotal) {
            skippedCount += 1;
            skipReasons.cap = (skipReasons.cap ?? 0) + 1;
            continue;
          }
          globalSeen.add(key);
          allHits.push(hit);
          linksExtracted += 1;
          newOnPage += 1;
        }

        if (newOnPage === 0) break;
      }

      let detailMessage: string | undefined;

      if (linksExtracted === 0 && !zeroReason) {
        if (source === "avito" && lastHtml) {
          detailMessage = diagnoseAvitoSearchPage(lastHtml, [], avitoMeta) ?? undefined;
          if (avitoMeta?.blocked || detailMessage?.includes("blocked")) {
            zeroReason = "blocked";
          } else if (avitoMeta?.jsShell) {
            zeroReason = "js_shell";
          } else {
            zeroReason = "no_selector";
          }
        } else if (source === "drom" && dromMeta) {
          detailMessage = diagnoseDromSearchPage(dromMeta, []) ?? undefined;
          zeroReason =
            dromMeta.sourceUnreliableForQuery ? "source_unreliable_for_query"
            : dromMeta.catalogOnly ? "catalog_only"
            : dromMeta.jsShell ? "js_shell"
            : "no_selector";
        } else if (source === "youla" && (lastError === "CAPTCHA" || zeroReason === "captcha")) {
          detailMessage = "Youla blocked by captcha";
          zeroReason = "captcha";
        } else {
          zeroReason = zeroReasonFromError(lastError || "NO_SELECTOR", 0);
        }
      }

      const blocked =
        zeroReason === "blocked" ||
        zeroReason === "captcha" ||
        lastError === "BLOCKED" ||
        lastError === "CAPTCHA";

      if (!detailMessage && linksExtracted === 0) {
        detailMessage =
          zeroReason === "blocked" ? "Avito blocked search page."
          : zeroReason === "captcha" ?
            source === "youla" ?
              "Youla blocked by captcha"
            : "Капча на странице источника."
          : zeroReason === "source_unreliable_for_query" ?
            "Drom: выдача не соответствует запросу."
          : zeroReason === "unsupported" ?
            "VK parser not implemented yet"
          : zeroReason === "disabled" ?
            "Youla blocked by captcha (источник отключён)."
          : zeroReason === "catalog_only" ? "Drom returned catalog pages, no real offers."
          : zeroReason === "js_shell" ?
            source === "avito" ?
              "Avito: список объявлений не в HTML (нужна мобильная выдача)."
            : "Drom: объявления подгружаются скриптом."
          : OFFER_SOURCE_ZERO_LABELS[zeroReason ?? "no_selector"] ?? "ссылок нет";
      }

      logCatalogOfferSearch("source_links_extracted", {
        source,
        linksExtracted,
        pagesScanned,
        httpStatus,
        zeroReason: linksExtracted > 0 ? null : zeroReason,
      });

      diagnostics.push({
        sourceName: source,
        searched: searchUrls.length > 0,
        blocked,
        searchUrls,
        httpStatus,
        pagesScanned,
        linksExtracted,
        skippedCount,
        parserErrors,
        zeroReason: linksExtracted > 0 ? null : zeroReason,
        skipReasons,
        message:
          linksExtracted === 0 ?
            detailMessage ?? lastErrorMessage ?? undefined
          : parserErrors > 0 ?
            `ошибки разбора: ${parserErrors}`
          : undefined,
        errorMessage: linksExtracted === 0 ? lastErrorMessage : null,
        errorCode: linksExtracted === 0 ? lastError || zeroReason : null,
        lastRequestUrl,
      });
      } catch (sourceErr) {
        const errorMessage = sourceErr instanceof Error ? sourceErr.message : String(sourceErr);
        logCatalogOfferSearch("source_failed", { source, error: errorMessage });
        logCatalogOfferSearch("source_links_extracted", { source, linksExtracted: 0, error: errorMessage });
        diagnostics.push({
          sourceName: source,
          searched: false,
          blocked: false,
          searchUrls: [],
          httpStatus: null,
          pagesScanned: 0,
          linksExtracted: 0,
          skippedCount: 0,
          parserErrors: 1,
          zeroReason: "parse_error",
          skipReasons: {},
          message: errorMessage,
          errorMessage,
          errorCode: "SOURCE_EXCEPTION",
          lastRequestUrl: null,
        });
      }
    }),
  );

  logCatalogOfferSearch("search_done", { total: allHits.length, sources: diagnostics.length });

  return { hits: allHits, diagnostics };
}

export const OFFER_SOURCE_ZERO_LABELS: Record<NonNullable<OfferSourceZeroReason>, string> = {
  blocked: "Avito blocked search page.",
  captcha: "капча / антибот",
  no_selector: "ссылки на объявления в HTML не найдены",
  empty_response: "пустой ответ",
  fetch_error: "ошибка загрузки",
  parse_error: "ошибка разбора HTML",
  unsupported: "источник не поддерживается",
  disabled: "источник отключён",
  city_unsupported: "город не в URL — ищем широко, фильтр после разбора",
  catalog_only: "Drom returned catalog pages, no real offers.",
  js_shell: "Drom: объявления подгружаются скриптом, ссылок в HTML нет.",
  source_unreliable_for_query: "Drom: нерелевантная выдача по запросу",
};
