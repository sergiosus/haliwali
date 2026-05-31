import type { FetchedHtml } from "./catalogHtmlFetch";
import type { ExtractionDefaults } from "./catalogExtractionTypes";
import type { CatalogSourceOfferInput } from "./catalogSourceOfferTypes";
import { catalogSourceNameFromUrl } from "./catalogSourceName";
import { metaContent, titleTag } from "./catalogExtractShared";
import { sanitizeOfferText } from "./catalogOfferSearchText";
import {
  offerListingSourceFromUrl,
  sanitizeSourceOfferInput,
  SOURCE_OFFER_SNIPPET_MAX,
} from "./catalogSourceOfferNormalize";
import { classifyInvalidSourceUrl } from "./catalogSourceOfferValidation";

/** Parse only `<head>` + early meta — never full page body text. */
const HEAD_SCAN_BYTES = 120_000;

const PRICE_HEAD_RE = [
  /itemprop="price"[^>]*content="(\d[\d\s]{0,12})"/i,
  /property="product:price:amount"[^>]*content="(\d[\d\s]{0,12})"/i,
  /"price"\s*:\s*"(\d[\d\s]{2,12})"/i,
  /"priceValue"\s*:\s*(\d[\d\s]{2,12})/i,
  /"lowPrice"\s*:\s*(\d[\d\s]{2,12})/i,
];
const OEM_RE = /\b(?:oem|арт(?:икул)?|код)[:\s#]*([A-Z0-9][A-Z0-9\-./]{3,24})\b/gi;
const ARTICLE_RE = /\b([A-Z]{1,4}[- ]?[0-9]{3,}[A-Z0-9\-./]*)\b/g;
const BRAND_RE = /\b(?:бренд|brand)[:\s]+([A-Za-zА-Яа-яЁё0-9][\w\-./]{1,40})/i;

function uniqueCodes(matches: Iterable<RegExpMatchArray>, limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const code = (m[1] ?? m[0]).trim().toUpperCase();
    if (code.length < 4 || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= limit) break;
  }
  return out;
}

function headSlice(html: string): string {
  const end = html.indexOf("</head>");
  if (end > 0) return html.slice(0, Math.min(end + 7, HEAD_SCAN_BYTES));
  return html.slice(0, HEAD_SCAN_BYTES);
}

function extractPriceFromHead(head: string): string | null {
  const blob = head.slice(0, 60_000);
  for (const re of PRICE_HEAD_RE) {
    const m = blob.match(re);
    if (!m?.[1]) continue;
    const digits = m[1].replace(/\D/g, "");
    if (digits) return digits;
  }
  const rub = blob.match(/([0-9][0-9\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)/i);
  if (rub?.[1]) {
    const digits = rub[1].replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

function extractCityFromHead(head: string, defaults: ExtractionDefaults): string {
  if (defaults.city?.trim()) return defaults.city.trim();
  const m =
    head.match(/itemprop="addressLocality"[^>]*content="([^"]{2,80})"/i) ??
    head.match(/"addressLocality"\s*:\s*"([^"]{2,80})"/i) ??
    head.match(/"location"\s*:\s*"([^"]{2,80})"/i);
  return m?.[1] ? sanitizeOfferText(m[1]) : "";
}

function detectCodes(blob: string): { oemCodes: string[]; articleCodes: string[] } {
  const slice = blob.slice(0, 500);
  return {
    oemCodes: uniqueCodes(slice.matchAll(OEM_RE)),
    articleCodes: uniqueCodes(slice.matchAll(ARTICLE_RE)),
  };
}

function detectBrand(blob: string): string | null {
  const m = blob.slice(0, 500).match(BRAND_RE);
  return m?.[1]?.trim().slice(0, 80) ?? null;
}

function sellerFromTitle(title: string): string {
  const parts = title.split(/[—–|·]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0]!.length <= 80) return parts[0]!;
  return "";
}

function isCatalogOrSearchPage(head: string, sourceUrl: string): boolean {
  if (classifyInvalidSourceUrl(sourceUrl)) return true;
  const lower = sourceUrl.toLowerCase();
  const ogType = metaContent(head, "og:type");
  if (ogType && /website|object/i.test(ogType) && !/product/i.test(ogType)) {
    if (!/\/sale\/|_\d{5,}|\/product\//i.test(lower)) return true;
  }
  return false;
}

/**
 * Minimal offer extract — allowed fields only, no full description/specs/contacts/photos.
 */
export function extractSourceOfferFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): CatalogSourceOfferInput | null {
  const sourceUrl = fetched.url.toString();
  const head = headSlice(fetched.html);
  if (isCatalogOrSearchPage(head, sourceUrl)) return null;

  const ogTitle = metaContent(head, "og:title");
  const ogDesc = metaContent(head, "og:description");
  const pageTitle = titleTag(head);
  const title = sanitizeOfferText((ogTitle || pageTitle).trim()).slice(0, 200);
  if (!title) return null;

  const shortSnippet = sanitizeOfferText((ogDesc || title).trim()).slice(0, SOURCE_OFFER_SNIPPET_MAX);
  const codeBlob = `${title} ${ogDesc ?? ""}`.slice(0, 500);
  const { oemCodes, articleCodes } = detectCodes(codeBlob);
  const brand = detectBrand(codeBlob);
  const sellerName = sellerFromTitle(title);
  const city = extractCityFromHead(head, defaults);
  const sourceName = catalogSourceNameFromUrl(sourceUrl);

  const draft: CatalogSourceOfferInput = {
    title,
    price: extractPriceFromHead(head),
    city,
    region: defaults.city && defaults.city !== city ? defaults.city : "",
    categorySlug: defaults.categorySlug,
    companyName: sellerName,
    sellerName,
    brand,
    oemCodes,
    articleCodes,
    sourceName: sourceName === "other" ? "company_site" : sourceName,
    sourceUrl,
    shortSnippet,
    confidenceScore: shortSnippet.length > 40 ? 0.65 : 0.45,
    rawPayload: { extractor: "source_offer", host: fetched.url.hostname },
  };

  return sanitizeSourceOfferInput(draft);
}
