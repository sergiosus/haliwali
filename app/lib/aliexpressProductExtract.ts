/**
 * AliExpress search-page product extraction with strict field quality.
 */

import type { ExternalMarketplaceCard, MarketplaceProvider } from "./externalMarketplaceProviders";
import {
  decodeHtmlEntities,
  isHumanReadableProductTitle,
  isValidAliExpressProductUrl,
  normalizeProductImageUrl,
} from "./marketplaceProductQuality";

const MAX = 8;

type RawCandidate = {
  externalUrl: string;
  title: string | null;
  imageUrl: string | null;
  price: string | null;
  snippet: string | null;
};

import { parsePriceValue } from "./marketplaceProductQuality";

function extractImageNear(html: string, index: number): string | null {
  const window = html.slice(Math.max(0, index - 2500), index + 2500);
  const patterns = [
    /data-src=["'](\/\/[^"']+alicdn[^"']+)["']/gi,
    /data-image=["'](\/\/[^"']+alicdn[^"']+)["']/gi,
    /src=["'](\/\/[^"']+alicdn[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /"imgUrl"\s*:\s*"(\/\/[^"\\]+alicdn[^"\\]+)"/gi,
    /"imageUrl"\s*:\s*"(\/\/[^"\\]+alicdn[^"\\]+)"/gi,
    /"image"\s*:\s*\{\s*"imgUrl"\s*:\s*"(\/\/[^"\\]+)"/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      const img = normalizeProductImageUrl(m[1]!);
      if (img) return img;
    }
  }
  const srcset = window.match(/srcset=["']([^"']+alicdn[^"']+)/i);
  if (srcset) {
    const first = srcset[1]!.split(/\s*,\s*/)[0]?.split(/\s+/)[0];
    if (first) return normalizeProductImageUrl(first);
  }
  return null;
}

function extractTitleNear(html: string, index: number): string | null {
  const window = html.slice(Math.max(0, index - 3000), index + 3000);
  const patterns = [
    /"title"\s*:\s*"([^"\\]{8,200})"/i,
    /"subject"\s*:\s*"([^"\\]{8,200})"/i,
    /aria-label=["']([^"']{8,200})["']/i,
    /alt=["']([^"']{8,200})["']/i,
  ];
  for (const re of patterns) {
    const m = window.match(re);
    if (m?.[1]) {
      const t = decodeHtmlEntities(m[1].replace(/\\u[\dA-Fa-f]{4}/g, " "));
      if (isHumanReadableProductTitle(t)) return t;
    }
  }
  return null;
}

function extractPriceNear(html: string, index: number): string | null {
  const window = html.slice(Math.max(0, index - 2000), index + 2000);
  const patterns = [
    /"formattedPrice"\s*:\s*"([^"]+)"/i,
    /"salePrice"\s*:\s*\{[^}]*"value"\s*:\s*"?([^",}]+)"?/i,
    /"minPrice"\s*:\s*"?([\d.]+)"?/i,
    /"price"\s*:\s*"?([\d.]+)"?/i,
    /product:price:amount["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = window.match(re);
    if (m?.[1]) return parsePriceValue(m[1]);
  }
  return null;
}

function collectFromJsonLdAliExpress(
  html: string,
  origin: string,
  provider: MarketplaceProvider,
  acc: Map<string, RawCandidate>,
): void {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const node = JSON.parse(m[1]!.trim()) as unknown;
      walkJsonLd(node, origin, provider, acc);
    } catch {
      /* skip */
    }
  }
}

function walkJsonLd(
  node: unknown,
  origin: string,
  provider: MarketplaceProvider,
  acc: Map<string, RawCandidate>,
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, origin, provider, acc);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const isProduct =
    type === "Product" || (Array.isArray(type) && type.includes("Product"));

  if (isProduct) {
    const name = typeof o.name === "string" ? decodeHtmlEntities(o.name) : null;
    let image: string | null = null;
    if (typeof o.image === "string") image = normalizeProductImageUrl(o.image);
    else if (Array.isArray(o.image) && typeof o.image[0] === "string") {
      image = normalizeProductImageUrl(o.image[0]);
    }
    let url: string | null = null;
    if (typeof o.url === "string") {
      try {
        url = new URL(o.url, origin).href;
      } catch {
        url = null;
      }
    }
    const offers = o.offers as Record<string, unknown> | undefined;
    const price = parsePriceValue(offers?.price);
    const snippet =
      typeof o.description === "string" ? decodeHtmlEntities(o.description).slice(0, 220) : null;

    if (url && isValidAliExpressProductUrl(url) && name && image) {
      mergeCandidate(acc, url, { externalUrl: url, title: name, imageUrl: image, price, snippet });
    }
  }

  for (const v of Object.values(o)) walkJsonLd(v, origin, provider, acc);
}

function mergeCandidate(map: Map<string, RawCandidate>, url: string, c: Partial<RawCandidate>): void {
  const key = url.split("#")[0]!;
  const prev = map.get(key);
  map.set(key, {
    externalUrl: key,
    title: c.title ?? prev?.title ?? null,
    imageUrl: c.imageUrl ?? prev?.imageUrl ?? null,
    price: c.price ?? prev?.price ?? null,
    snippet: c.snippet ?? prev?.snippet ?? null,
  });
}

function collectItemUrls(html: string, origin: string): { url: string; index: number }[] {
  const out: { url: string; index: number }[] = [];
  const re = /href=["']([^"']*\/item\/\d+\.html[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < MAX * 4) {
    let href = decodeHtmlEntities(m[1]!);
    if (href.startsWith("//")) href = `https:${href}`;
    else if (href.startsWith("/")) href = `${origin}${href}`;
    if (!href.startsWith("http")) continue;
    try {
      const u = new URL(href).href.split("#")[0]!;
      if (isValidAliExpressProductUrl(u)) out.push({ url: u, index: m.index });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function extractAliExpressProductCandidates(
  provider: MarketplaceProvider,
  html: string,
  _normalizedQuery: string,
): ExternalMarketplaceCard[] {
  const origin = "https://www.aliexpress.com";
  const candidates = new Map<string, RawCandidate>();

  collectFromJsonLdAliExpress(html, origin, provider, candidates);

  for (const { url, index } of collectItemUrls(html, origin)) {
    mergeCandidate(candidates, url, {
      externalUrl: url,
      title: extractTitleNear(html, index),
      imageUrl: extractImageNear(html, index),
      price: extractPriceNear(html, index),
    });
  }

  const cards: ExternalMarketplaceCard[] = [];
  for (const c of candidates.values()) {
    if (cards.length >= MAX) break;
    if (!c.title || !c.imageUrl || !isValidAliExpressProductUrl(c.externalUrl)) continue;
    if (!isHumanReadableProductTitle(c.title)) continue;
    cards.push({
      providerId: provider.id,
      sourceName: provider.name,
      title: c.title.slice(0, 200),
      snippet: c.snippet,
      price: c.price,
      imageUrl: c.imageUrl,
      externalUrl: c.externalUrl,
      linkOnly: false,
    });
  }

  return cards;
}
