import type { FetchedHtml } from "./catalogHtmlFetch";
import type { ExtractionDefaults } from "./catalogExtractionTypes";
import type { CatalogSourceOfferInput } from "./catalogSourceOfferTypes";
import { catalogSourceNameFromUrl } from "./catalogSourceName";
import {
  metaContent,
  stripTags,
  titleTag,
} from "./catalogExtractShared";

const MAX_SNIPPET = 280;

const PRICE_RE =
  /(?:цена|стоимость|price)[:\s]*([0-9][0-9\s\u00a0.,]{2,20}(?:\s*(?:₽|руб\.?|р\.))?)/i;
const PRICE_NUM_RE = /([0-9][0-9\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)/i;
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

function extractPrice(visible: string, ogDesc: string): string | null {
  const blob = `${visible} ${ogDesc}`;
  const m = blob.match(PRICE_RE) ?? blob.match(PRICE_NUM_RE);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 40);
}

function detectCodes(visible: string): { oemCodes: string[]; articleCodes: string[] } {
  const oemCodes = uniqueCodes(visible.matchAll(OEM_RE));
  const articleCodes = uniqueCodes(visible.matchAll(ARTICLE_RE));
  return { oemCodes, articleCodes };
}

function detectBrand(visible: string): string | null {
  const m = visible.match(BRAND_RE);
  return m?.[1]?.trim().slice(0, 80) ?? null;
}

function sellerFromTitle(title: string): string {
  const parts = title.split(/[—–|·]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0]!.length <= 80) return parts[0]!;
  return "";
}

/** Legal-safe minimal extract — no full description or photo galleries. */
export function extractSourceOfferFromHtml(
  fetched: FetchedHtml,
  defaults: ExtractionDefaults,
): CatalogSourceOfferInput | null {
  const html = fetched.html;
  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");
  const pageTitle = titleTag(html);
  const title = (ogTitle || pageTitle).trim().slice(0, 200);
  if (!title) return null;

  const visible = stripTags(html).replace(/\s+/g, " ").slice(0, 6000);
  const shortSnippet = (ogDesc || "").trim().replace(/\s+/g, " ").slice(0, MAX_SNIPPET);
  const cityMatch = visible.match(/(?:г\.|город)\s*([А-Яа-яЁё\-]{2,40})/i);
  const city = defaults.city || cityMatch?.[1]?.trim() || "";
  const { oemCodes, articleCodes } = detectCodes(visible);
  const brand = detectBrand(visible);
  const sellerName = sellerFromTitle(title);
  const sourceUrl = fetched.url.toString();
  const sourceName = catalogSourceNameFromUrl(sourceUrl);

  return {
    title,
    price: extractPrice(visible, ogDesc ?? ""),
    city,
    region: defaults.city && defaults.city !== city ? defaults.city : "",
    categorySlug: defaults.categorySlug,
    companyName: sellerName,
    sellerName,
    brand,
    oemCodes,
    articleCodes,
    sourceName: sourceName === "other" && defaults.categorySlug ? "company_site" : sourceName,
    sourceUrl,
    shortSnippet,
    confidenceScore: shortSnippet.length > 40 ? 0.65 : 0.45,
    rawPayload: { extractor: "source_offer", host: fetched.url.hostname },
  };
}
