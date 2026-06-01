/**
 * Auto.ru SERP card parser — no per-listing page fetches.
 */

import {
  decodeJsonString,
  extractCityFromContext,
  extractPriceFromBlob,
  isRealOfferListingUrl,
  sanitizeOfferText,
  titleFromListingUrl,
  validateOfferLinkFromSearchPage,
} from "./catalogOfferSearchText";
import type { OfferSourceSearchHit } from "./catalogOfferSourceSearch";

function normalizeAutoRuUrl(raw: string, baseUrl: string): string | null {
  try {
    const u = new URL(raw, baseUrl);
    if (!/auto\.ru$/i.test(u.hostname.replace(/^www\./i, "")) && !/\.auto\.ru$/i.test(u.hostname)) {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function extractThumbnail(ctx: string): string | null {
  const m =
    ctx.match(/"preview"\s*:\s*"([^"]+)"/i) ??
    ctx.match(/"image"\s*:\s*"([^"]+)"/i) ??
    ctx.match(/src="(https:\/\/[^"]+(?:avatars|images)[^"]+)"/i);
  if (!m?.[1]) return null;
  const u = decodeJsonString(m[1]);
  return /^https?:\/\//i.test(u) ? u.slice(0, 500) : null;
}

function extractYearMileage(ctx: string): { year: number | null; mileageKm: number | null } {
  let year: number | null = null;
  let mileageKm: number | null = null;
  const yearM =
    ctx.match(/"year"\s*:\s*(\d{4})/i) ??
    ctx.match(/(\d{4})\s*г\.?/i) ??
    ctx.match(/>(\d{4})\s*г\.?</i);
  if (yearM?.[1]) {
    const y = Number(yearM[1]);
    if (y >= 1980 && y <= new Date().getFullYear() + 1) year = y;
  }
  const kmM =
    ctx.match(/"km_age"\s*:\s*(\d+)/i) ??
    ctx.match(/"mileage"\s*:\s*(\d+)/i) ??
    ctx.match(/([\d\s\u00a0]{2,9})\s*км/i);
  if (kmM?.[1]) {
    const km = Number(String(kmM[1]).replace(/\D/g, ""));
    if (Number.isFinite(km) && km > 0 && km < 2_000_000) mileageKm = km;
  }
  return { year, mileageKm };
}

function buildSnippet(title: string, year: number | null, mileageKm: number | null): string {
  const parts = [title];
  if (year) parts.push(`${year} г.`);
  if (mileageKm) parts.push(`${mileageKm.toLocaleString("ru-RU")} км`);
  return sanitizeOfferText(parts.join(" · ")).slice(0, 280);
}

function pushAutoRuHit(
  hits: OfferSourceSearchHit[],
  seen: Set<string>,
  rawUrl: string,
  baseUrl: string,
  cityDefault: string,
  ctx: string,
  titleHint = "",
): void {
  const url = normalizeAutoRuUrl(rawUrl, baseUrl);
  if (!url || !isRealOfferListingUrl(url, "auto_ru") || seen.has(url)) return;
  seen.add(url);

  const { year, mileageKm } = extractYearMileage(ctx);
  const title = sanitizeOfferText(
    titleHint ||
      decodeJsonString(ctx.match(/"title"\s*:\s*"([^"]{4,220})"/i)?.[1] ?? "") ||
      decodeJsonString(ctx.match(/"mark_model"\s*:\s*"([^"]{4,220})"/i)?.[1] ?? "") ||
      titleFromListingUrl(url) ||
      "",
  );
  if (!title || title.length < 3) return;

  const priceRaw = extractPriceFromBlob(ctx);
  const imageUrl = extractThumbnail(ctx);
  const snippet = buildSnippet(title, year, mileageKm);

  const hit: OfferSourceSearchHit = {
    url,
    title: title.slice(0, 200),
    snippet,
    price: priceRaw,
    city: sanitizeOfferText(extractCityFromContext(ctx) || cityDefault),
    sellerHint: "",
    sourceName: "auto_ru",
    fromSearchPage: true,
    imageUrl,
    year,
    mileageKm,
    cardComplete: Boolean(title && priceRaw && url),
  };

  if (validateOfferLinkFromSearchPage(hit, "auto_ru")) return;
  hits.push(hit);
}

export function buildAutoRuSearchUrls(query: string, city: string, page: number): string[] {
  const q = encodeURIComponent(query.trim());
  const slug = city.trim().length >= 2 ? city.trim().toLowerCase().replace(/\s+/g, "-") : "";
  const base =
    slug ?
      `https://auto.ru/${slug}/cars/all/?query=${q}`
    : `https://auto.ru/cars/all/?query=${q}`;
  if (page <= 1) return [base];
  return [`${base}&page=${page}`];
}

export function parseAutoRuSearchHtml(
  html: string,
  baseUrl: string,
  cityDefault: string,
): OfferSourceSearchHit[] {
  const hits: OfferSourceSearchHit[] = [];
  const seen = new Set<string>();

  const patterns: RegExp[] = [
    /https?:\/\/auto\.ru\/[a-z0-9_./%-]+\/sale\/[a-z0-9_./%-]+\d{6,}\/?/gi,
    /https?:\/\/auto\.ru\/cars\/used\/sale\/[a-z0-9_./%-]+\d{6,}\/?/gi,
    /href="(\/cars\/used\/sale\/[^"]+\d{6,}\/?)"/gi,
    /href="(https?:\/\/auto\.ru\/[^"]+\/sale\/[^"]+\d{6,}\/?)"/gi,
    /"url"\s*:\s*"(https?:\\\/\\\/auto\.ru\\\/[^"]+sale[^"]+)"/gi,
  ];

  for (const urlRe of patterns) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const raw = (m[1] ?? m[0]!).replace(/\\\//g, "/");
      const ctx = html.slice(Math.max(0, m.index - 400), m.index + 1000);
      const titleHint = decodeJsonString(ctx.match(/"title"\s*:\s*"([^"]{4,220})"/i)?.[1] ?? "");
      pushAutoRuHit(hits, seen, raw, baseUrl, cityDefault, ctx, titleHint);
    }
  }

  const blockRe =
    /"saleId"\s*:\s*"[^"]+"[\s\S]{0,800}?"title"\s*:\s*"([^"]{4,220})"[\s\S]{0,800}?"url"\s*:\s*"([^"]+)"/gi;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(html)) !== null) {
    const titleHint = decodeJsonString(bm[1]!);
    const rawUrl = decodeJsonString(bm[2]!.replace(/\\\//g, "/"));
    pushAutoRuHit(hits, seen, rawUrl, baseUrl, cityDefault, bm[0]!, titleHint);
  }

  return hits;
}
