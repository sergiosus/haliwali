/**
 * Lightweight product extraction from public search HTML (allowed providers only).
 */

import { extractAliExpressProductCandidates } from "./aliexpressProductExtract";
import type { ExternalMarketplaceCard, MarketplaceProvider, MarketplaceProviderId } from "./externalMarketplaceProviders";
import {
  decodeHtmlEntities,
  filterCardsWithDiagnostics,
  isHumanReadableProductTitle,
  logProviderCardDiagnostics,
  normalizeProductImageUrl,
  parsePriceValue,
} from "./marketplaceProductQuality";
import { isFakeMarketplaceTitle, isProviderCatalogSearchUrl } from "./marketplaceCardQuality";

const MAX_PER_PROVIDER = 8;

const PRODUCT_PATH_HINTS: Partial<Record<MarketplaceProviderId, RegExp>> = {
  ozon: /\/product\/[a-z0-9-]+/i,
  wildberries: /\/catalog\/\d+\/detail/i,
  ebay: /\/itm\/\d+/i,
  amazon: /\/dp\/[A-Z0-9]{8,}/i,
  drom: /\/catalog\/.*\/\d+/i,
};

function decodeHtmlAttr(s: string): string {
  return decodeHtmlEntities(s);
}

function absolutizeUrl(href: string, origin: string): string | null {
  const h = decodeHtmlAttr(href);
  if (!h || h.startsWith("javascript:")) return null;
  try {
    if (h.startsWith("http")) return h;
    if (h.startsWith("//")) return `https:${h}`;
    if (h.startsWith("/")) return `${origin}${h}`;
  } catch {
    return null;
  }
  return null;
}

function extractOrigin(searchUrl: string): string {
  try {
    return new URL(searchUrl).origin;
  } catch {
    return "";
  }
}

function readJsonLdObjects(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]!.trim()) as unknown);
    } catch {
      /* skip */
    }
  }
  return out;
}

function collectFromJsonLd(
  node: unknown,
  origin: string,
  normalizedQuery: string,
  provider: MarketplaceProvider,
  acc: ExternalMarketplaceCard[],
): void {
  if (!node || acc.length >= MAX_PER_PROVIDER) return;

  if (Array.isArray(node)) {
    for (const item of node) collectFromJsonLd(item, origin, normalizedQuery, provider, acc);
    return;
  }

  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;

  const type = o["@type"];
  const isProduct =
    type === "Product" || (Array.isArray(type) && type.includes("Product"));

  if (isProduct) {
    const name = typeof o.name === "string" ? decodeHtmlEntities(o.name) : "";
    let image: string | null = null;
    if (typeof o.image === "string") image = normalizeProductImageUrl(o.image);
    else if (Array.isArray(o.image) && typeof o.image[0] === "string") {
      image = normalizeProductImageUrl(o.image[0]);
    }
    const urlRaw = typeof o.url === "string" ? absolutizeUrl(o.url, origin) : null;
    const offers = o.offers as Record<string, unknown> | undefined;
    const price = parsePriceValue(offers?.price);
    const description =
      typeof o.description === "string" ? decodeHtmlEntities(o.description).slice(0, 220) : null;

    if (
      name &&
      image &&
      urlRaw &&
      isHumanReadableProductTitle(name) &&
      !isFakeMarketplaceTitle(name, normalizedQuery)
    ) {
      acc.push({
        providerId: provider.id,
        sourceName: provider.name,
        title: name.slice(0, 200),
        snippet: description,
        price,
        imageUrl: image,
        externalUrl: urlRaw,
        linkOnly: false,
      });
    }
  }

  for (const v of Object.values(o)) {
    if (acc.length >= MAX_PER_PROVIDER) break;
    collectFromJsonLd(v, origin, normalizedQuery, provider, acc);
  }
}

function extractGenericProductCandidates(
  provider: MarketplaceProvider,
  html: string,
  normalizedQuery: string,
  searchUrl: string,
): ExternalMarketplaceCard[] {
  const origin = extractOrigin(searchUrl);
  if (!origin) return [];

  const cards: ExternalMarketplaceCard[] = [];
  const seen = new Set<string>();

  for (const node of readJsonLdObjects(html)) {
    collectFromJsonLd(node, origin, normalizedQuery, provider, cards);
    for (const c of cards) seen.add(c.externalUrl);
  }

  const hint = PRODUCT_PATH_HINTS[provider.id];
  if (hint) {
    const re = /href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && cards.length < MAX_PER_PROVIDER * 2) {
      const abs = absolutizeUrl(m[1]!, origin);
      if (!abs || !hint.test(abs) || seen.has(abs)) continue;
      if (isProviderCatalogSearchUrl(abs, provider.id, normalizedQuery)) continue;
      const idx = m.index;
      const title = extractTitleNearGeneric(html, idx);
      const imageUrl = extractImageNearGeneric(html, idx, provider.id);
      if (!title || !imageUrl || !isHumanReadableProductTitle(title)) continue;
      cards.push({
        providerId: provider.id,
        sourceName: provider.name,
        title: title.slice(0, 200),
        snippet: null,
        price: extractPriceNearGeneric(html, idx),
        imageUrl,
        externalUrl: abs.split("#")[0]!,
        linkOnly: false,
      });
      seen.add(abs);
    }
  }

  return cards.slice(0, MAX_PER_PROVIDER);
}

function extractTitleNearGeneric(html: string, index: number): string | null {
  const window = html.slice(Math.max(0, index - 2000), index + 2000);
  for (const re of [
    /aria-label=["']([^"']{8,200})["']/i,
    /alt=["']([^"']{8,200})["']/i,
    /"title"\s*:\s*"([^"\\]{8,200})"/i,
  ]) {
    const m = window.match(re);
    if (m?.[1]) {
      const t = decodeHtmlEntities(m[1]);
      if (isHumanReadableProductTitle(t)) return t;
    }
  }
  return null;
}

function extractImageNearGeneric(
  html: string,
  index: number,
  _providerId: MarketplaceProviderId,
): string | null {
  const window = html.slice(Math.max(0, index - 2000), index + 2000);
  const patterns = [
    /data-src=["']([^"']+)["']/gi,
    /data-image=["']([^"']+)["']/gi,
    /src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      const img = normalizeProductImageUrl(m[1]!);
      if (img) return img;
    }
  }
  return null;
}

function extractPriceNearGeneric(html: string, index: number): string | null {
  const window = html.slice(Math.max(0, index - 1500), index + 1500);
  const m =
    window.match(/"price"\s*:\s*"?([\d.,]+)"?/i) ||
    window.match(/"formattedPrice"\s*:\s*"([^"]+)"/i);
  return m?.[1] ? parsePriceValue(m[1]) : null;
}

/**
 * Parse product candidates from provider search HTML; quality-filtered before return.
 */
export function extractProductCardsFromSearchHtml(
  provider: MarketplaceProvider,
  html: string,
  normalizedQuery: string,
  searchUrl: string,
): ExternalMarketplaceCard[] {
  if (provider.id !== "aliexpress") {
    return [];
  }
  const raw = extractAliExpressProductCandidates(provider, html, normalizedQuery);

  const { accepted, stats } = filterCardsWithDiagnostics(raw, provider.id, normalizedQuery);
  logProviderCardDiagnostics(provider.id, stats);
  return accepted;
}
