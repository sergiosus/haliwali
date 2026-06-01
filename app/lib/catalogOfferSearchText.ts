/**
 * UTF-8 / windows-1251 decoding and text quality for admin offer search.
 */

import type { OfferListingSourceId } from "./catalogSourceOfferTypes";

export type { OfferListingSourceId } from "./catalogSourceOfferTypes";

export type OfferHitSkipReason =
  | "bad_encoding"
  | "not_listing"
  | "insufficient_fields"
  | "generic_title";

function charsetFromContentType(ct: string | null | undefined): string | null {
  const m = ct?.match(/charset=([^;\s]+)/i);
  return m?.[1]?.replace(/['"]/g, "").toLowerCase() ?? null;
}

function charsetFromHtmlMeta(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8192));
  const m =
    head.match(/<meta[^>]+charset=["']?\s*([^"'>\s;]+)/i) ??
    head.match(/<meta[^>]+content=["'][^"']*;\s*charset=([^"'>\s]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function scoreDecodedRussianText(text: string): number {
  const sample = text.slice(0, 80_000);
  let score = 0;
  if (sample.includes("\uFFFD")) score -= 120;
  const cyr = (sample.match(/[\u0400-\u04FF]/g) ?? []).length;
  score += Math.min(cyr / 50, 40);
  const mojibake = (sample.match(/(?:Ã.|Ð.|Ñ.|Â.)/g) ?? []).length;
  score -= mojibake * 4;
  if (/[а-яё]{4,}/i.test(sample)) score += 15;
  return score;
}

/** UTF-8 bytes misread as Latin-1 (Ð¡Ð°Ð»Ð¾ → Сало). */
export function tryRepairMojibake(text: string): string {
  const t = text.trim();
  if (!t || !/[ÐÑÃÂ][\u0080-\u00ff]/.test(t)) return text;
  try {
    const bytes = Uint8Array.from([...t].map((ch) => ch.charCodeAt(0) & 0xff));
    const fixed = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!hasBadEncoding(fixed) && scoreDecodedRussianText(fixed) > scoreDecodedRussianText(t) + 5) {
      return fixed;
    }
  } catch {
    /* ignore */
  }
  return text;
}

/** Pick best decode among UTF-8, windows-1251, iso-8859-5 using Cyrillic heuristics. */
export function decodeHtmlBytes(buf: ArrayBuffer, contentType?: string | null): string {
  const bytes = new Uint8Array(buf);
  const declared = charsetFromContentType(contentType) ?? charsetFromHtmlMeta(bytes);

  let encodings: string[];
  if (declared === "windows-1251" || declared === "cp1251" || declared === "cp-1251") {
    encodings = ["windows-1251", "utf-8", "iso-8859-5"];
  } else if (declared === "utf-8" || declared === "utf8") {
    encodings = ["utf-8", "windows-1251", "iso-8859-5"];
  } else {
    encodings = ["utf-8", "windows-1251", "iso-8859-5"];
  }

  let best = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const enc of encodings) {
    const text = tryDecode(bytes, enc);
    if (!text) continue;
    const score = scoreDecodedRussianText(text);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return (best || tryDecode(bytes, "utf-8") || "").slice(0, 1_200_000);
}

export function decodeJsonString(s: string): string {
  const raw = s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"');
  return sanitizeOfferText(tryRepairMojibake(raw));
}

export function extractPriceFromBlob(blob: string): string | null {
  const m =
    blob.match(/([0-9][0-9\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)/i) ??
    blob.match(/"price"\s*:\s*"?(\d[\d\s]{2,})"?/i);
  if (!m?.[1]) return null;
  const digits = m[1].replace(/\D/g, "");
  return digits ? digits : null;
}

export function sanitizeOfferText(text: string): string {
  return tryRepairMojibake(text)
    .replace(/\uFFFD/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasBadEncoding(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.includes("\uFFFD")) return true;
  const cyr = (t.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latinExt = (t.match(/[À-ÿ]/g) ?? []).length;
  const mojibakeRuns = (t.match(/(?:Ð|Ñ|Ã|Â)[\u0080-\u00ff]/g) ?? []).length;
  if (mojibakeRuns >= 2 && cyr < 3) return true;
  if (latinExt >= 4 && cyr === 0 && t.length > 8) return true;
  if (/^(?:Ã|Ð|Ñ|Â)/.test(t) && cyr < 2) return true;
  const letters = (t.match(/[a-zA-Zа-яёА-ЯЁ]/g) ?? []).length;
  if (t.length > 12 && letters < t.length * 0.25) return true;
  return false;
}

const MARKETPLACE_GENERIC_TITLE_RES = [
  /^авито\s*[—–\-]\s*объявлен/i,
  /объявлени[яе]\s+на\s+сайте\s+авито/i,
  /^drom\s*[—–\-]\s*каталог/i,
  /^дром\s*[—–\-]\s*каталог/i,
  /объявлени[яе]\s+на\s+сайте/i,
  /продажа\s+автомобилей\s+в\s+россии/i,
  /подержанные\s+авто.*(?:drom|дром)/i,
  /купить\s+автомобил/i,
  /^юла\s*[—–\-]/i,
  /^youla\s*[—–\-]/i,
  /^vk\s+маркет\s*[—–\-]/i,
];

export function isGenericOfferTitle(title: string): boolean {
  const t = sanitizeOfferText(title);
  if (t.length < 4) return true;
  if (/^(объявление|товар|продажа|купить|vk объявление|item|listing)$/i.test(t)) return true;
  if (/^[\d_\-\s.]+$/.test(t)) return true;
  for (const re of MARKETPLACE_GENERIC_TITLE_RES) {
    if (re.test(t)) return true;
  }
  return false;
}

/** Real sale listing URLs — exclude model catalog, search, category hubs. */
export function isRealOfferListingUrl(url: string, source: OfferListingSourceId): boolean {
  const lower = url.toLowerCase();
  try {
    const u = new URL(url);
    const path = u.pathname;

    if (source === "avito") {
      if (!/avito\.ru/i.test(u.hostname)) return false;
      if (/\/(add|search|catalog|brands|profile|user|shops|favorites|comparison)\b/i.test(path)) return false;
      if (/\/all\/?$/i.test(path)) return false;
      const pathOnly = path.split("?")[0] ?? path;
      return /_\d{8,}$/.test(pathOnly) || /\/\d{8,}$/.test(pathOnly);
    }

    if (source === "auto_ru") {
      if (!/(^|\.)auto\.ru$/i.test(u.hostname)) return false;
      if (/\/catalog(\/|$)/i.test(path)) return false;
      if (/\/search\b/i.test(path)) return false;
      return (
        /\/sale\//i.test(path) ||
        /\/cars\/used\//i.test(path) ||
        /\/\d{7,}\/?(?:\?|$)/.test(path)
      );
    }

    if (source === "drom") {
      if (/\/catalog(\/|$|\?)/i.test(path)) return false;
      if (/\/(model|generation|wheel|specs|reviews|faq|compare)\b/i.test(path)) return false;
      if (/\/search\b/i.test(path)) return false;
      if (/baza\.drom\.ru/i.test(lower)) {
        return /\/sell_|\/buy_|\/zapchasti\//i.test(path) && /\d{5,}/.test(path);
      }
      if (/auto\.drom\.ru/i.test(lower)) {
        if (/\/all\/?$/i.test(path)) return false;
        return /\d{6,}\.html$/i.test(path);
      }
      if (/\.drom\.ru/i.test(lower)) return false;
      return false;
    }

    if (source === "youla") {
      if (!/youla\.ru/i.test(u.hostname)) return false;
      if (/\/search\b/i.test(path)) return false;
      return /\/product\//i.test(path) || /\/[0-9a-f]{20,}/i.test(path);
    }

    if (source === "vk") {
      return /vk\.(?:com|ru)\/(?:market\/product|market\/-?\d+)/i.test(lower);
    }

    return false;
  } catch {
    return false;
  }
}

export function meetsMinimumOfferFields(hit: {
  title: string;
  url: string;
  price: string | null;
  city: string;
  snippet: string;
  companyName?: string;
  sellerName?: string;
}): boolean {
  if (!hit.url?.trim() || !hit.title?.trim()) return false;
  if (hit.title.trim().length < 5) return false;
  if (hasBadEncoding(hit.title)) return false;
  if (hit.snippet && hasBadEncoding(hit.snippet)) return false;
  if (isGenericOfferTitle(hit.title)) return false;

  const snippetOk = Boolean(
    hit.snippet?.trim() &&
      hit.snippet.length > 14 &&
      !isGenericOfferTitle(hit.snippet) &&
      !hasBadEncoding(hit.snippet),
  );

  const hasExtra = Boolean(
    hit.price ||
    hit.city?.trim() ||
    hit.companyName?.trim() ||
    hit.sellerName?.trim() ||
    snippetOk,
  );
  return hasExtra;
}

export function extractCityFromContext(ctx: string): string {
  const m =
    ctx.match(/"location"\s*:\s*"([^"]{2,80})"/i) ??
    ctx.match(/"city"\s*:\s*"([^"]{2,80})"/i) ??
    ctx.match(/"region"\s*:\s*"([^"]{2,80})"/i);
  return m?.[1] ? sanitizeOfferText(decodeJsonString(m[1])) : "";
}

export function extractSellerFromContext(ctx: string): string {
  const m =
    ctx.match(/"sellerName"\s*:\s*"([^"]{2,120})"/i) ??
    ctx.match(/"shopName"\s*:\s*"([^"]{2,120})"/i) ??
    ctx.match(/"companyName"\s*:\s*"([^"]{2,120})"/i);
  return m?.[1] ? sanitizeOfferText(decodeJsonString(m[1])) : "";
}

/** Link from marketplace search page — URL + title only (no price required yet). */
/** Title from listing URL path when SERP card has no text. */
export function titleFromListingUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const withoutLastId = parts.filter((p) => !/^\d{5,}(?:\.html)?$/i.test(p) && !/^\d{8,}$/.test(p));
    if (/drom\.ru|auto\.ru/i.test(u.hostname) && withoutLastId.length >= 2) {
      const slugParts = withoutLastId.slice(-3).map((p) => p.replace(/\.html$/i, ""));
      const t = slugParts.join(" ").replace(/[-_]+/g, " ").trim();
      if (t.length >= 3) return t;
    }
    const seg = parts.pop() ?? "";
    const withoutId = seg.replace(/_\d{8,}$/, "").replace(/\.html$/i, "");
    const t = withoutId.replace(/[-_]+/g, " ").trim();
    return t.length >= 3 ? t : "";
  } catch {
    return "";
  }
}

/** Visible listing title from Drom SERP card HTML around the listing link. */
export function extractDromCardTitle(ctx: string, url: string): string {
  const patterns: RegExp[] = [
    /<a[^>]+href="[^"]*\d{6,}\.html"[^>]*\stitle="([^"]{4,220})"/i,
    /<a[^>]+href="[^"]*\d{6,}\.html"[^>]*>([^<]{4,220})<\/a>/i,
    /data-title="([^"]{4,220})"/i,
    /"(?:bullTitle|bull_title|cardTitle)"\s*:\s*"([^"]{4,220})"/i,
    /<span[^>]*class="[^"]*bull-item[^"]*title[^"]*"[^>]*>([^<]{4,220})/i,
    /<div[^>]*class="[^"]*b-title[^"]*"[^>]*>([^<]{4,220})/i,
    /<h3[^>]*>([^<]{4,220})<\/h3>/i,
  ];
  for (const re of patterns) {
    const m = ctx.match(re);
    if (!m?.[1]) continue;
    const t = sanitizeOfferText(decodeJsonString(m[1]));
    if (t.length >= 4 && !/^[\d\s.,]+$/.test(t) && !isGenericOfferTitle(t)) return t;
  }
  return titleFromListingUrl(url);
}

export function validateOfferLinkFromSearchPage(
  hit: {
    url: string;
    title: string;
    snippet: string;
  },
  source: OfferListingSourceId,
): OfferHitSkipReason | null {
  if (!isRealOfferListingUrl(hit.url, source)) return "not_listing";
  let title = sanitizeOfferText(hit.title);
  if (!title || title.length < 3) title = titleFromListingUrl(hit.url);
  if (!title || title.length < 3) return "insufficient_fields";
  if (hasBadEncoding(title)) return "bad_encoding";
  const snippet = sanitizeOfferText(hit.snippet);
  if (snippet && hasBadEncoding(snippet)) return "bad_encoding";
  return null;
}

export function validateOfferSearchHit(
  hit: {
    url: string;
    title: string;
    snippet: string;
    price: string | null;
    city: string;
    companyName?: string;
    sellerName?: string;
    sellerHint?: string;
  },
  source: OfferListingSourceId,
): OfferHitSkipReason | null {
  if (!isRealOfferListingUrl(hit.url, source)) return "not_listing";
  const title = sanitizeOfferText(hit.title);
  const snippet = sanitizeOfferText(hit.snippet);
  if (hasBadEncoding(title) || (snippet && hasBadEncoding(snippet))) return "bad_encoding";
  const normalized = {
    ...hit,
    title,
    snippet: snippet || title,
    sellerName: hit.sellerName || hit.sellerHint || "",
  };
  if (!meetsMinimumOfferFields(normalized)) return "insufficient_fields";
  return null;
}
