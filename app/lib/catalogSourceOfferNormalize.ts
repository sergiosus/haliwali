/**
 * Allowed offer fields only — used before DB write and admin display.
 */

import { catalogSourceNameFromUrl } from "./catalogSourceName";
import {
  hasBadEncoding,
  isRealOfferListingUrl,
  sanitizeOfferText,
  type OfferListingSourceId,
} from "./catalogOfferSearchText";
import type { CatalogSourceName, CatalogSourceOfferInput } from "./catalogSourceOfferTypes";

export const SOURCE_OFFER_SNIPPET_MAX = 280;
export const SOURCE_OFFER_TITLE_MAX = 200;

export function offerListingSourceFromUrl(url: string): OfferListingSourceId | null {
  const lower = url.toLowerCase();
  if (lower.includes("avito.ru")) return "avito";
  if (lower.includes("youla.ru")) return "youla";
  if (lower.includes("drom.ru") || lower.includes("auto.ru")) return "drom";
  if (lower.includes("vk.com") || lower.includes("vk.ru")) return "vk";
  return null;
}

function trimCodes(codes: string[], limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const c = sanitizeOfferText(raw).toUpperCase().slice(0, 32);
    if (c.length < 3 || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** Keep only allowed fields; return null if title/url invalid or listing URL rejected. */
export function sanitizeSourceOfferInput(
  input: CatalogSourceOfferInput,
): CatalogSourceOfferInput | null {
  const sourceUrl = input.sourceUrl?.trim();
  if (!sourceUrl) return null;

  const title = sanitizeOfferText(input.title).slice(0, SOURCE_OFFER_TITLE_MAX);
  if (!title || title.length < 3 || hasBadEncoding(title)) return null;

  const listingSource = offerListingSourceFromUrl(sourceUrl);
  if (listingSource && !isRealOfferListingUrl(sourceUrl, listingSource)) return null;

  let shortSnippet = sanitizeOfferText(input.shortSnippet).slice(0, SOURCE_OFFER_SNIPPET_MAX);
  if (!shortSnippet || hasBadEncoding(shortSnippet)) {
    shortSnippet = title.slice(0, SOURCE_OFFER_SNIPPET_MAX);
  }
  if (hasBadEncoding(shortSnippet)) return null;

  const companyName = sanitizeOfferText(input.companyName).slice(0, 120);
  const sellerName = sanitizeOfferText(input.sellerName || companyName).slice(0, 120);
  const brandRaw = input.brand ? sanitizeOfferText(input.brand).slice(0, 80) : "";
  const brand = brandRaw && !hasBadEncoding(brandRaw) ? brandRaw : null;

  let host = "";
  try {
    host = new URL(sourceUrl).hostname;
  } catch {
    return null;
  }

  const sourceName: CatalogSourceName =
    input.sourceName === "company_site" ? "company_site"
    : listingSource ?? catalogSourceNameFromUrl(sourceUrl);

  return {
    title,
    price: input.price ? sanitizeOfferText(String(input.price)).replace(/\s+/g, " ").slice(0, 40) : null,
    city: sanitizeOfferText(input.city).slice(0, 120),
    region: sanitizeOfferText(input.region).slice(0, 120),
    categorySlug: input.categorySlug,
    companyName,
    sellerName,
    brand,
    oemCodes: trimCodes(input.oemCodes),
    articleCodes: trimCodes(input.articleCodes),
    sourceName,
    sourceUrl,
    shortSnippet,
    confidenceScore: Math.min(1, Math.max(0, input.confidenceScore ?? 0.45)),
    rawPayload: { extractor: "source_offer", host },
  };
}
