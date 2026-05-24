/**
 * Product card quality gates and per-provider rejection diagnostics.
 */

import type { ExternalMarketplaceCard, MarketplaceProviderId } from "./externalMarketplaceProviders";
import { MARKETPLACE_PROVIDERS } from "./externalMarketplaceProviders";

const FAKE_TITLE_PATTERNS: readonly RegExp[] = [
  /товары по запросу/i,
  /^товары на\s/i,
  /^поиск\b/i,
  /^search\b/i,
  /^results?\s+for\b/i,
  /^купить\s+.*\s+на\s/i,
  /online shopping/i,
  /official site/i,
  /^aliexpress\b/i,
  /^amazon\.?com/i,
  /^ebay\b/i,
  /^ozon\.?ru?\b/i,
  /^wildberries\b/i,
  /wholesale/i,
  /^дром\b/i,
  /^найти\s/i,
  /сравни.*цен/i,
  /^shopping\b/i,
  /^интернет-магазин/i,
];

export function isFakeMarketplaceTitle(title: string, normalizedQuery?: string): boolean {
  const t = title.trim();
  if (t.length < 5) return true;
  if (FAKE_TITLE_PATTERNS.some((p) => p.test(t))) return true;
  const q = (normalizedQuery ?? "").trim().toLowerCase();
  if (q && t.toLowerCase().includes(q) && /запросу|поиск|search|найти|купить|на\s+\w+/i.test(t)) {
    return true;
  }
  return false;
}

export function isProviderCatalogSearchUrl(
  externalUrl: string,
  providerId: MarketplaceProviderId,
  normalizedQuery: string,
): boolean {
  const provider = MARKETPLACE_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return true;
  const searchUrl = provider.buildSearchUrl(normalizedQuery).trim();
  const ext = externalUrl.trim();
  if (!ext || ext === searchUrl) return true;
  try {
    const e = new URL(ext);
    const s = new URL(searchUrl);
    if (e.origin === s.origin && e.pathname === s.pathname && e.search === s.search) return true;
    if (
      /\/search|\/catalog|wholesale|sch\/i\.html|offer_search|SearchText=/i.test(
        `${e.pathname}${e.search}`,
      ) &&
      e.origin === s.origin
    ) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

export type CardRejectReason = "badTitle" | "badImage" | "badUrl" | "badPriceSnippet" | "linkOnly";

export type ProviderCardDiagnostics = {
  raw: number;
  accepted: number;
  badTitle: number;
  badImage: number;
  badUrl: number;
  badPriceSnippet: number;
};

const PLACEHOLDER_IMAGE = /placeholder|1x1|pixel|spacer|blank|data:image\/svg|transparent\.gif/i;
const TRACKING_IMAGE = /\/trace\/|\/beacon\/|doubleclick|analytics|favicon/i;
const ALICDN_HOST = /alicdn\.com/i;

const GARBAGE_TITLE = [
  /\.html\b/i,
  /algo[_\s-]?pvid/i,
  /^https?:\/\//i,
  /^\/\//,
  /\.(php|asp|aspx)\b/i,
  /pvid=/i,
  /spm=/i,
  /^\d{10,}\.html/i,
  /^[\d._\-\s]{12,}$/,
  /^\d+\.html/i,
];

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProductImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = decodeHtmlEntities(raw).replace(/\\u002F/gi, "/").replace(/\\/g, "");
  if (!u) return null;
  if (u.startsWith("//")) u = `https:${u}`;
  if (u.startsWith("/") && !u.startsWith("//")) return null;
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function isMostlyNumericTitle(title: string): boolean {
  const letters = title.replace(/[^a-zA-Z\u0400-\u04FF0-9]/g, "");
  if (!letters.length) return true;
  const digits = (letters.match(/\d/g) ?? []).length;
  return digits / letters.length > 0.65;
}

export function isHumanReadableProductTitle(title: string, minLen = 6): boolean {
  const t = decodeHtmlEntities(title);
  if (t.length < minLen) return false;
  if (GARBAGE_TITLE.some((p) => p.test(t))) return false;
  if (/^[\d\s._\-/]+$/i.test(t)) return false;
  if (isMostlyNumericTitle(t)) return false;
  if (/\b[a-z]{2,}\d{5,}\.html/i.test(t)) return false;
  const letterCount = (t.match(/[a-zA-Z\u0400-\u04FF]/g) ?? []).length;
  if (letterCount < 4) return false;
  return true;
}

export function isValidProductImageUrl(
  imageUrl: string | null | undefined,
  providerId?: MarketplaceProviderId,
): boolean {
  const u = normalizeProductImageUrl(imageUrl);
  if (!u) return false;
  if (PLACEHOLDER_IMAGE.test(u)) return false;
  if (TRACKING_IMAGE.test(u)) return false;
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) && !ALICDN_HOST.test(u)) return false;
  if (providerId === "aliexpress" && !ALICDN_HOST.test(u) && !/ae\d+\.alicdn/i.test(u)) {
    if (!/aliexpress/i.test(u)) return false;
  }
  return true;
}

export function isValidAliExpressProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/aliexpress\.(com|ru|us)/i.test(u.hostname)) return false;
    return /\/item\/\d+\.html/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isValidProductPageUrl(
  url: string,
  providerId: MarketplaceProviderId,
  normalizedQuery: string,
): boolean {
  const ext = url.trim();
  if (!/^https?:\/\//i.test(ext)) return false;
  if (isProviderCatalogSearchUrl(ext, providerId, normalizedQuery)) return false;
  if (providerId === "aliexpress") return isValidAliExpressProductUrl(ext);
  if (providerId === "wildberries") return /\/catalog\/\d+\/detail/i.test(ext);
  if (providerId === "ozon") return /\/product\//i.test(ext);
  if (providerId === "ebay") return /\/itm\/\d+/i.test(ext);
  if (providerId === "amazon") return /\/dp\/[A-Z0-9]{10}/i.test(ext);
  return true;
}

function hasUsefulSnippet(snippet: string | null | undefined): boolean {
  const s = decodeHtmlEntities(snippet ?? "");
  if (s.length < 12) return false;
  return isHumanReadableProductTitle(s, 8);
}

export function parsePriceValue(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || !/\d/.test(t)) return null;
  return t.slice(0, 40);
}

function hasValidPrice(price: string | null | undefined): boolean {
  const p = (price ?? "").trim();
  if (!p) return false;
  if (!/\d/.test(p)) return false;
  return p.length >= 2 && p.length <= 40;
}

/**
 * AliExpress: stricter gate — price or useful snippet required in addition to title/image/url.
 */
export function passesAliExpressCardGate(card: ExternalMarketplaceCard): boolean {
  if (!isHumanReadableProductTitle(card.title)) return false;
  if (!isValidProductImageUrl(card.imageUrl, "aliexpress")) return false;
  if (!isValidAliExpressProductUrl(card.externalUrl)) return false;
  if (!hasValidPrice(card.price) && !hasUsefulSnippet(card.snippet)) return false;
  return true;
}

export function validateMarketplaceProductCard(
  card: ExternalMarketplaceCard,
  normalizedQuery: string,
): { ok: true } | { ok: false; reason: CardRejectReason } {
  if (card.linkOnly) return { ok: false, reason: "linkOnly" };

  const externalUrl = (card.externalUrl ?? "").trim();
  if (!isValidProductPageUrl(externalUrl, card.providerId, normalizedQuery)) {
    return { ok: false, reason: "badUrl" };
  }

  if (!isValidProductImageUrl(card.imageUrl, card.providerId)) {
    return { ok: false, reason: "badImage" };
  }

  const title = decodeHtmlEntities(card.title ?? "");
  if (!isHumanReadableProductTitle(title) || isFakeMarketplaceTitle(title, normalizedQuery)) {
    return { ok: false, reason: "badTitle" };
  }

  if (card.providerId === "aliexpress") {
    if (!passesAliExpressCardGate(card)) {
      if (!hasValidPrice(card.price) && !hasUsefulSnippet(card.snippet)) {
        return { ok: false, reason: "badPriceSnippet" };
      }
      if (!isValidProductImageUrl(card.imageUrl, "aliexpress")) return { ok: false, reason: "badImage" };
      if (!isHumanReadableProductTitle(card.title)) return { ok: false, reason: "badTitle" };
      return { ok: false, reason: "badUrl" };
    }
    return { ok: true };
  }

  return { ok: true };
}

export function filterCardsWithDiagnostics(
  cards: ExternalMarketplaceCard[],
  providerId: MarketplaceProviderId,
  normalizedQuery: string,
): { accepted: ExternalMarketplaceCard[]; stats: ProviderCardDiagnostics } {
  const stats: ProviderCardDiagnostics = {
    raw: cards.length,
    accepted: 0,
    badTitle: 0,
    badImage: 0,
    badUrl: 0,
    badPriceSnippet: 0,
  };
  const accepted: ExternalMarketplaceCard[] = [];

  for (const card of cards) {
    if (card.providerId !== providerId) continue;
    const v = validateMarketplaceProductCard(card, normalizedQuery);
    if (v.ok) {
      accepted.push({
        ...card,
        title: decodeHtmlEntities(card.title).slice(0, 200),
        imageUrl: normalizeProductImageUrl(card.imageUrl),
        snippet: card.snippet ? decodeHtmlEntities(card.snippet).slice(0, 220) : null,
      });
      stats.accepted += 1;
    } else {
      switch (v.reason) {
        case "badTitle":
          stats.badTitle += 1;
          break;
        case "badImage":
          stats.badImage += 1;
          break;
        case "badUrl":
          stats.badUrl += 1;
          break;
        case "badPriceSnippet":
          stats.badPriceSnippet += 1;
          break;
        default:
          stats.badUrl += 1;
      }
    }
  }

  return { accepted, stats };
}

export function logProviderCardDiagnostics(
  providerId: MarketplaceProviderId,
  stats: ProviderCardDiagnostics,
): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(
    `[MP_PROVIDER] ${providerId} raw=${stats.raw} accepted=${stats.accepted} badTitle=${stats.badTitle} badImage=${stats.badImage} badUrl=${stats.badUrl} badPriceSnippet=${stats.badPriceSnippet}`,
  );
}
