import type { FetchedHtml } from "./catalogHtmlFetch";
import type { ExtractionDefaults } from "./catalogExtractionTypes";
import { inferOfferType } from "./catalogSourceOfferType";
import type { CatalogSourceOfferInput } from "./catalogSourceOfferTypes";
import { catalogSourceNameFromUrl } from "./catalogSourceName";
import { metaContent, titleTag } from "./catalogExtractShared";
import { parseListingPriceFromContext } from "./catalogOfferPrice";
import { sanitizeOfferText } from "./catalogOfferSearchText";
import {
  offerListingSourceFromUrl,
  sanitizeSourceOfferInput,
  SOURCE_OFFER_SNIPPET_MAX,
} from "./catalogSourceOfferNormalize";
import { resolveAvitoImageUrl } from "./catalogSourceOfferCoverImage";
import { classifyInvalidSourceUrl } from "./catalogSourceOfferValidation";

const HEAD_SCAN_BYTES = 120_000;
const ENRICH_SCAN_BYTES = 420_000;

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

function enrichSlice(html: string): string {
  // Keep parsing fast but allow JSON-LD / NEXT_DATA blocks.
  return html.slice(0, ENRICH_SCAN_BYTES);
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (parsed == null) continue;
    if (Array.isArray(parsed)) out.push(...parsed);
    else out.push(parsed);
  }
  return out;
}

function extractFirstJsonString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractFirstJsonNumber(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string") {
      const digits = v.replace(/[^\d]/g, "");
      const n = Number(digits);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function pickImageFromJsonLd(node: unknown, baseUrl: string): string | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const img = rec.image;
  if (typeof img === "string") return resolveAvitoImageUrl(img, baseUrl);
  if (Array.isArray(img)) {
    for (const it of img) {
      if (typeof it === "string") {
        const url = resolveAvitoImageUrl(it, baseUrl);
        if (url) return url;
      }
    }
  }
  return null;
}

function pickOfferLikeJsonLd(nodes: unknown[]): Record<string, unknown> | null {
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    const rec = n as Record<string, unknown>;
    const t = rec["@type"];
    const type = Array.isArray(t) ? String(t[0] ?? "") : String(t ?? "");
    if (/^(Offer|Product|Vehicle)$/i.test(type)) return rec;
    if (type === "WebPage" || type === "Organization") continue;
    // Some pages embed `@graph`.
    const graph = rec["@graph"];
    if (Array.isArray(graph)) {
      const picked = pickOfferLikeJsonLd(graph);
      if (picked) return picked;
    }
  }
  return null;
}

function extractFromNextData(html: string): unknown | null {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  return safeJsonParse(m[1]);
}

function findFirstLikelyImageUrl(blob: string, baseUrl: string): string | null {
  const re = /https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    const url = resolveAvitoImageUrl(m[0]!, baseUrl);
    if (url) return url;
  }
  return null;
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
  const html = enrichSlice(fetched.html);
  const head = headSlice(html);
  if (isCatalogOrSearchPage(head, sourceUrl)) return null;

  const pageOrigin = fetched.url.origin;

  // 1) JSON-LD
  const ldAll = jsonLdBlocks(html);
  const ld = pickOfferLikeJsonLd(ldAll);
  const ldName = ld ? extractFirstJsonString(ld, ["name", "headline", "title"]) : null;
  const ldBrand =
    ld ?
      extractFirstJsonString(ld, ["brand", "manufacturer", "model"]) ??
        (typeof (ld.brand as unknown) === "object" ?
          extractFirstJsonString(ld.brand, ["name"])
        : null)
    : null;
  const ldImage = ld ? pickImageFromJsonLd(ld, pageOrigin) : null;
  const ldOffers = ld ? (ld.offers as unknown) : null;
  const ldOfferObj =
    ldOffers && typeof ldOffers === "object" && !Array.isArray(ldOffers) ? (ldOffers as Record<string, unknown>)
    : Array.isArray(ldOffers) && ldOffers.length > 0 && typeof ldOffers[0] === "object" ?
      (ldOffers[0] as Record<string, unknown>)
    : null;
  const ldPriceAmount =
    ldOfferObj ? extractFirstJsonNumber(ldOfferObj, ["price", "priceValue", "lowPrice"]) : null;

  // 2) OpenGraph
  const ogTitle = metaContent(head, "og:title");
  const ogDesc = metaContent(head, "og:description");
  const ogImage = metaContent(head, "og:image");
  const pageTitle = titleTag(head);

  // 3) App state (NEXT_DATA + other global blobs)
  const nextData = extractFromNextData(html);
  const nextBlob = nextData ? JSON.stringify(nextData).slice(0, 140_000) : "";

  // 4) Visible HTML selectors / fallback blobs
  const htmlBlob = html.slice(0, 220_000);

  const titlePicked = (ldName || ogTitle || pageTitle).trim();
  const title = sanitizeOfferText(titlePicked).slice(0, 200);
  if (!title) return null;
  const titleSource =
    ldName ? "metadata"
    : ogTitle ? "metadata"
    : "listing";

  const shortSnippet = sanitizeOfferText((ogDesc || title).trim()).slice(0, SOURCE_OFFER_SNIPPET_MAX);
  const codeBlob = `${title} ${ogDesc ?? ""} ${ldBrand ?? ""}`.slice(0, 500);
  const { oemCodes, articleCodes } = detectCodes(codeBlob);
  const brand = (ldBrand ? sanitizeOfferText(ldBrand).slice(0, 80) : null) ?? detectBrand(codeBlob);
  const sellerName = sellerFromTitle(title);
  const city = extractCityFromHead(head, defaults);
  const sourceName = catalogSourceNameFromUrl(sourceUrl);

  const coverFromOg = ogImage ? resolveAvitoImageUrl(ogImage, pageOrigin) : null;
  const coverFromApp = nextBlob ? findFirstLikelyImageUrl(nextBlob, pageOrigin) : null;
  const coverFromHtml = findFirstLikelyImageUrl(htmlBlob, pageOrigin);
  const coverImageUrl = ldImage ?? coverFromOg ?? coverFromApp ?? coverFromHtml ?? null;

  const priceFromLd =
    ldPriceAmount != null ?
      { priceAmount: ldPriceAmount, priceText: null, price: String(ldPriceAmount) }
    : null;
  const headPrice = parseListingPriceFromContext(head);
  const appPrice = nextBlob ? parseListingPriceFromContext(nextBlob) : { priceAmount: null, priceText: null, price: null };
  const bodyPrice = parseListingPriceFromContext(htmlBlob);
  const priceFields = priceFromLd ?? (headPrice.priceAmount ? headPrice : appPrice.priceAmount ? appPrice : bodyPrice);

  const priceSource =
    priceFromLd ? "json-ld"
    : headPrice.priceAmount ? "og"
    : appPrice.priceAmount ? "app-state"
    : bodyPrice.priceAmount ? "html"
    : "none";

  const imageSource =
    ldImage ? "json_ld"
    : coverFromOg ? "og_image"
    : coverFromApp ? "page_data"
    : coverFromHtml ? "card_img"
    : "none";

  const draft: CatalogSourceOfferInput = {
    title,
    price: priceFields.price,
    priceAmount: priceFields.priceAmount,
    priceText: priceFields.priceText,
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
    offerType: inferOfferType({ query: title, oemArticle: articleCodes[0] }),
    coverImageUrl,
    confidenceScore: shortSnippet.length > 40 ? 0.65 : 0.45,
    rawPayload: {
      extractor: "source_offer",
      host: fetched.url.hostname,
      parseStatus: "enriched",
      imageSource,
      priceSource,
      titleSource,
    },
  };

  return sanitizeSourceOfferInput(draft);
}
