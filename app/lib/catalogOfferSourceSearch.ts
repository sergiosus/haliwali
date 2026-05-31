/**
 * Direct marketplace search for admin offer import (Avito, Drom, Youla, VK).
 * Fetches search result pages — not company discover / SERP.
 */

import { logCatalogDiscover } from "./catalogCatalogLog";
import { assertCatalogFetchAllowed } from "./catalogHtmlFetch";
import { assertPublicResolvableHost } from "./catalogUrlSafety";
import { slugifyCatalogText } from "./catalogSlug";
import type { CatalogSourceName } from "./catalogSourceOfferTypes";

export type OfferListingSourceId = "avito" | "drom" | "youla" | "vk";

export type OfferSourceZeroReason =
  | "blocked"
  | "captcha"
  | "no_selector"
  | "empty_response"
  | "fetch_error"
  | "parse_error"
  | "unsupported"
  | "city_unsupported"
  | null;

export type OfferSourceSearchDiagnostic = {
  sourceName: OfferListingSourceId;
  searchUrls: string[];
  httpStatus: number | null;
  pagesFetched: number;
  parsedCount: number;
  skippedCount: number;
  zeroReason: OfferSourceZeroReason;
  skipReasons: Record<string, number>;
  message?: string;
};

export type OfferSourceSearchHit = {
  url: string;
  title: string;
  snippet: string;
  price: string | null;
  city: string;
  sourceName: CatalogSourceName;
  fromSearchPage: boolean;
};

const MAX_PAGES_PER_SOURCE = 3;
const MAX_TOTAL_HITS = 100;
const FETCH_TIMEOUT_MS = 12_000;

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function sourceUserAgent(id: OfferListingSourceId): string {
  return id === "vk" ? BROWSER_UA : MOBILE_UA;
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
): Promise<{ ok: true; status: number; html: string; url: string } | { ok: false; status: number | null; error: string }> {
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
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf).slice(0, 1_200_000);
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

function decodeJsonString(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/");
}

function extractPriceFromBlob(blob: string): string | null {
  const m =
    blob.match(/([0-9][0-9\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)/i) ??
    blob.match(/"price"\s*:\s*"?(\d[\d\s]{2,})"?/i);
  if (!m?.[1]) return null;
  const digits = m[1].replace(/\D/g, "");
  return digits ? digits : null;
}

function isAvitoListingUrl(url: string): boolean {
  return (
    /avito\.ru\/[^?\s]+_\d{5,}/i.test(url) &&
    !/\/(add|search|catalog|brands|profile|user|shops|favorites)\b/i.test(url)
  );
}

function avitoListingUrlFromPath(path: string, baseUrl: string): string | null {
  const cleaned = path.replace(/\\\//g, "/").split("?")[0] ?? "";
  if (!/_\d{5,}$/.test(cleaned) && !/_\d{5,}\//.test(cleaned)) return null;
  if (/\/(add|search|catalog|brands|profile)\b/i.test(cleaned)) return null;
  const rel = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return normalizeListingUrl(`https://www.avito.ru${rel}`, baseUrl);
}

function isDromListingUrl(url: string): boolean {
  return (
    /drom\.ru\/[^?\s]+\/\d{5,}/i.test(url) ||
    /auto\.ru\/[^?\s]+\/\d{5,}/i.test(url) ||
    (/drom\.ru\/catalog\//i.test(url) && /\d{5,}/.test(url))
  );
}

function isYoulaListingUrl(url: string): boolean {
  return /youla\.ru\/(?:product|user\/[^/]+\/product|[^/]+\/[^/]+)/i.test(url) && !/\/search\b/i.test(url);
}

function isVkListingUrl(url: string): boolean {
  return /vk\.(?:com|ru)\/(?:market\/product|market\/-?\d+|wall|item)/i.test(url);
}

function pushAvitoHit(
  hits: OfferSourceSearchHit[],
  seen: Set<string>,
  rawUrl: string,
  baseUrl: string,
  cityDefault: string,
  titleHint: string,
  ctx: string,
): void {
  const url = normalizeListingUrl(rawUrl, baseUrl);
  if (!url || !isAvitoListingUrl(url) || seen.has(url)) return;
  seen.add(url);
  const title =
    titleHint ||
    url
      .split("/")
      .pop()
      ?.replace(/_\d+$/, "")
      .replace(/_/g, " ") ||
    "Объявление";
  hits.push({
    url,
    title: title.slice(0, 200),
    snippet: title.slice(0, 280),
    price: extractPriceFromBlob(ctx),
    city: cityDefault,
    sourceName: "avito",
    fromSearchPage: true,
  });
}

function parseAvitoSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const seen = new Set<string>();

  const urlRe = /https?:\/\/(?:www\.)?avito\.ru\/[a-z0-9_./-]+_\d{5,}/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    pushAvitoHit(hits, seen, m[0]!, baseUrl, cityDefault, "", html.slice(Math.max(0, m.index - 200), m.index + 400));
  }

  const pathRe = /"urlPath"\s*:\s*"(\/[^"\\]+_\d{5,}[^"\\]*)"/gi;
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

  const hrefRe = /href="(\/[a-z0-9_-]+\/[^"]+?_\d{5,})"/gi;
  while ((m = hrefRe.exec(html)) !== null) {
    const built = avitoListingUrlFromPath(m[1]!, baseUrl);
    if (built) pushAvitoHit(hits, seen, built, baseUrl, cityDefault, "", html.slice(m.index, m.index + 400));
  }

  const itemRe =
    /"id"\s*:\s*(\d{6,})[\s\S]{0,400}?"title"\s*:\s*"([^"]{3,200})"[\s\S]{0,400}?"urlPath"\s*:\s*"([^"]+)"/gi;
  while ((m = itemRe.exec(html)) !== null) {
    const built = avitoListingUrlFromPath(m[3]!, baseUrl);
    if (built) pushAvitoHit(hits, seen, built, baseUrl, cityDefault, decodeJsonString(m[2]!), m[0]!);
  }

  return hits;
}

function parseDromSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const patterns = [
    /https?:\/\/(?:www\.)?drom\.ru\/[a-z0-9_./-]+\/\d{5,}/gi,
    /https?:\/\/auto\.ru\/[a-z0-9_./-]+\/\d{5,}/gi,
  ];
  const seen = new Set<string>();
  for (const urlRe of patterns) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const url = normalizeListingUrl(m[0]!, baseUrl);
      if (!url || !isDromListingUrl(url) || seen.has(url)) continue;
      seen.add(url);
      const slug = url.split("/").filter(Boolean).pop() ?? "Объявление";
      const title = decodeURIComponent(slug).replace(/[-_]+/g, " ").slice(0, 200);
      const ctx = html.slice(Math.max(0, m.index - 200), m.index + 400);
      hits.push({
        url,
        title,
        snippet: title,
        price: extractPriceFromBlob(ctx),
        city: cityDefault,
        sourceName: "drom",
        fromSearchPage: true,
      });
    }
  }
  return hits;
}

function parseYoulaSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const urlRe = /https?:\/\/youla\.ru\/[a-z0-9_./-]+/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    const url = normalizeListingUrl(m[0]!, baseUrl);
    if (!url || !isYoulaListingUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const title =
      decodeJsonString(
        html.slice(m.index, m.index + 600).match(/"name"\s*:\s*"([^"]{3,200})"/i)?.[1] ??
          html.slice(m.index, m.index + 600).match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ??
          "",
      ) || url.split("/").pop()?.replace(/[-_]+/g, " ") || "Объявление";
    const ctx = html.slice(Math.max(0, m.index - 200), m.index + 400);
    hits.push({
      url,
      title: title.slice(0, 200),
      snippet: title.slice(0, 280),
      price: extractPriceFromBlob(ctx),
      city: cityDefault,
      sourceName: "other",
      fromSearchPage: true,
    });
  }
  return hits;
}

function parseVkSearchHtml(html: string, baseUrl: string, cityDefault: string): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const urlRe = /https?:\/\/vk\.(?:com|ru)\/(?:market\/product[^"'<\s]+|market\/-?\d+[^"'<\s]*)/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    const url = normalizeListingUrl(m[0]!, baseUrl);
    if (!url || !isVkListingUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const title =
      decodeJsonString(html.slice(m.index - 300, m.index + 300).match(/"title"\s*:\s*"([^"]{3,200})"/i)?.[1] ?? "") ||
      "VK объявление";
    hits.push({
      url,
      title: title.slice(0, 200),
      snippet: title.slice(0, 280),
      price: extractPriceFromBlob(html.slice(m.index - 200, m.index + 400)),
      city: cityDefault,
      sourceName: "vk",
      fromSearchPage: true,
    });
  }
  return hits;
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
    const base = `https://www.drom.ru/catalog/?q=${q}`;
    const url = page <= 1 ? base : `${base}&page=${page}`;
    const alt = page <= 1 ? `https://auto.drom.ru/?q=${q}` : `${base}&p=${page}`;
    return { urls: page === 1 ? [base, alt] : [url], cityInUrl: false };
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

function parseSearchHtml(
  source: OfferListingSourceId,
  html: string,
  baseUrl: string,
  cityDefault: string,
): OfferSourceSearchHit[] {
  if (source === "avito") return parseAvitoSearchHtml(html, baseUrl, cityDefault);
  if (source === "drom") return parseDromSearchHtml(html, baseUrl, cityDefault);
  if (source === "youla") return parseYoulaSearchHtml(html, baseUrl, cityDefault);
  return parseVkSearchHtml(html, baseUrl, cityDefault);
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
  if (filter === "drom") return ["drom"];
  if (filter === "youla") return ["youla"];
  if (filter === "vk") return ["vk"];
  if (filter === "all") return ["avito", "drom", "youla", "vk"];
  return [];
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

  logCatalogDiscover("offer_source_search_start", { query: query.slice(0, 60), sources: opts.sources });

  await Promise.all(
    opts.sources.map(async (source) => {
      const skipReasons: Record<string, number> = {};
      const searchUrls: string[] = [];
      let httpStatus: number | null = null;
      let pagesFetched = 0;
      let parsedCount = 0;
      let skippedCount = 0;
      let zeroReason: OfferSourceZeroReason = null;
      let lastError = "";

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
          const fetched = await fetchSearchPage(searchUrl, source);
          if (!fetched.ok) {
            lastError = fetched.error;
            httpStatus = fetched.status;
            if (page === 1) zeroReason = zeroReasonFromError(fetched.error, 0);
            continue;
          }
          httpStatus = fetched.status;
          pagesFetched += 1;
          pageOk = true;
          const batch = parseSearchHtml(source, fetched.html, fetched.url, city);
          pageHits.push(...batch);
          if (batch.length > 0) break;
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
        for (const hit of pageHits) {
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
          parsedCount += 1;
          newOnPage += 1;
        }

        if (newOnPage === 0) break;
      }

      if (parsedCount === 0 && !zeroReason) {
        zeroReason = zeroReasonFromError(lastError || "NO_SELECTOR", 0);
      }

      diagnostics.push({
        sourceName: source,
        searchUrls,
        httpStatus,
        pagesFetched,
        parsedCount,
        skippedCount,
        zeroReason: parsedCount > 0 ? null : zeroReason,
        skipReasons,
        message:
          parsedCount === 0 && zeroReason === "city_unsupported" ?
            "Город не встроен в URL источника — ищем широко, фильтр после разбора"
          : undefined,
      });
    }),
  );

  logCatalogDiscover("offer_source_search_done", { total: allHits.length });

  return { hits: allHits, diagnostics };
}

export const OFFER_SOURCE_ZERO_LABELS: Record<NonNullable<OfferSourceZeroReason>, string> = {
  blocked: "заблокировано источником",
  captcha: "капча / антибот",
  no_selector: "не найдены карточки на странице поиска",
  empty_response: "пустой ответ",
  fetch_error: "ошибка загрузки",
  parse_error: "ошибка разбора HTML",
  unsupported: "источник не поддерживается",
  city_unsupported: "город не в URL — ищем широко, фильтр после разбора",
};
