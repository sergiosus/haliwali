/**
 * Source offer quality gates — real listing pages only, not marketplace hubs/search.
 */

import {
  hasBadEncoding,
  isGenericOfferTitle,
  isRealOfferListingUrl,
  sanitizeOfferText,
  titleFromListingUrl,
} from "./catalogOfferSearchText";
import { offerListingSourceFromUrl } from "./catalogSourceName";
import type { CatalogSourceName, CatalogSourceOfferInput } from "./catalogSourceOfferTypes";

export type SourceOfferRejectReason =
  | "invalid_source_page"
  | "search_page_not_offer"
  | "catalog_page_not_offer"
  | "generic_title"
  | "missing_required_fields";

export const SOURCE_OFFER_REJECT_LABELS: Record<SourceOfferRejectReason, string> = {
  invalid_source_page: "Страница источника не является объявлением",
  search_page_not_offer: "Ссылка на поиск, а не на объявление",
  catalog_page_not_offer: "Ссылка на каталог/модель, а не на объявление",
  generic_title: "Общий заголовок площадки, не объявление",
  missing_required_fields: "Недостаточно данных для публикации",
};

const REJECT_HINT_PREFIX = "reject:";

export function formatSourceOfferRejectHint(reason: SourceOfferRejectReason): string {
  return `${REJECT_HINT_PREFIX}${reason}`;
}

export function parseSourceOfferRejectHint(hint: string | null | undefined): SourceOfferRejectReason | null {
  if (!hint?.startsWith(REJECT_HINT_PREFIX)) return null;
  const code = hint.slice(REJECT_HINT_PREFIX.length) as SourceOfferRejectReason;
  return code in SOURCE_OFFER_REJECT_LABELS ? code : null;
}

export function sourceOfferRejectLabel(hint: string | null | undefined): string | null {
  const code = parseSourceOfferRejectHint(hint);
  return code ? SOURCE_OFFER_REJECT_LABELS[code] : null;
}

/** Classify hub/search/catalog URLs — returns null when URL looks like a real listing. */
export function classifyInvalidSourceUrl(url: string): SourceOfferRejectReason | null {
  const raw = url?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "invalid_source_page";

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "invalid_source_page";
  }

  const path = u.pathname;
  const pathLower = path.toLowerCase();
  const lower = raw.toLowerCase();

  if (pathLower === "/" || pathLower === "") return "invalid_source_page";

  const listingSource = offerListingSourceFromUrl(raw);

  if (/\/all\/?$/i.test(pathLower) && (u.searchParams.has("q") || u.searchParams.has("query"))) {
    return "search_page_not_offer";
  }
  if (/\/search(\/|$)/i.test(pathLower) && !/\d{5,}/.test(pathLower)) {
    return "search_page_not_offer";
  }
  if ((u.searchParams.has("q") || u.searchParams.has("query")) && listingSource) {
    if (!isRealOfferListingUrl(raw, listingSource)) return "search_page_not_offer";
  }

  if (/\/catalog(\/|$)/i.test(pathLower) && !/\/sale\//i.test(lower)) {
    return "catalog_page_not_offer";
  }
  if (/\/(model|generation|wheel|specs|reviews|faq|compare)\b/i.test(pathLower)) {
    return "catalog_page_not_offer";
  }

  if (listingSource) {
    if (isRealOfferListingUrl(raw, listingSource)) return null;
    if (/\/catalog/i.test(pathLower)) return "catalog_page_not_offer";
    if (/\/search|\/all\?/i.test(lower)) return "search_page_not_offer";
    return "invalid_source_page";
  }

  const segments = pathLower.split("/").filter(Boolean);
  if (segments.length <= 1 && !u.search) return "invalid_source_page";

  return null;
}

export function meetsPublishedSourceOfferMinimum(input: {
  title: string;
  sourceUrl: string;
  sourceName: CatalogSourceName;
  price: string | null;
  city: string;
  shortSnippet: string;
  companyName?: string;
  sellerName?: string;
}): boolean {
  if (!input.sourceUrl?.trim() || !input.title?.trim()) return false;
  if (input.title.trim().length < 5) return false;
  if (hasBadEncoding(input.title)) return false;
  if (isGenericOfferTitle(input.title)) return false;

  const snippet = sanitizeOfferText(input.shortSnippet);
  const snippetOk = Boolean(
    snippet.length > 14 && !isGenericOfferTitle(snippet) && !hasBadEncoding(snippet),
  );

  return Boolean(
    input.price?.trim() ||
    input.city?.trim() ||
    input.companyName?.trim() ||
    input.sellerName?.trim() ||
    snippetOk,
  );
}

export type SourceOfferValidationResult =
  | { ok: true; input: CatalogSourceOfferInput }
  | { ok: false; reason: SourceOfferRejectReason };

export function validateSourceOfferInput(
  input: CatalogSourceOfferInput,
): SourceOfferValidationResult {
  const sourceUrl = input.sourceUrl?.trim();
  if (!sourceUrl) return { ok: false, reason: "missing_required_fields" };

  const title = sanitizeOfferText(input.title);
  if (!title || title.length < 3 || hasBadEncoding(title)) {
    return { ok: false, reason: "missing_required_fields" };
  }

  const urlReason = classifyInvalidSourceUrl(sourceUrl);
  if (urlReason) return { ok: false, reason: urlReason };

  const listingSource = offerListingSourceFromUrl(sourceUrl);
  if (listingSource && !isRealOfferListingUrl(sourceUrl, listingSource)) {
    const again = classifyInvalidSourceUrl(sourceUrl) ?? "invalid_source_page";
    return { ok: false, reason: again };
  }

  if (isGenericOfferTitle(title)) return { ok: false, reason: "generic_title" };

  if (!meetsPublishedSourceOfferMinimum({ ...input, title })) {
    return { ok: false, reason: "missing_required_fields" };
  }

  return { ok: true, input: { ...input, title } };
}

export function isValidPublishedSourceOffer(input: CatalogSourceOfferInput): boolean {
  return validateSourceOfferInput(input).ok;
}

/** Public catalog list — rows already in catalog_source_offers; do not re-apply strict import gates. */
export function isPublicListableSourceOffer(input: {
  title: string;
  sourceUrl: string;
}): boolean {
  const title = sanitizeOfferText(input.title);
  const sourceUrl = input.sourceUrl?.trim() ?? "";
  if (!title || title.length < 3 || hasBadEncoding(title)) return false;
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return false;
  return true;
}

/** Candidate from admin search — real listing URL + title; extra fields optional. */
export function validateSourceOfferDraftCandidate(
  input: CatalogSourceOfferInput,
): SourceOfferValidationResult {
  const sourceUrl = input.sourceUrl?.trim();
  if (!sourceUrl) return { ok: false, reason: "missing_required_fields" };

  const urlReason = classifyInvalidSourceUrl(sourceUrl);
  if (urlReason) return { ok: false, reason: urlReason };

  const listingSource = offerListingSourceFromUrl(sourceUrl);
  if (!listingSource) {
    return { ok: false, reason: "invalid_source_page" };
  }
  if (!isRealOfferListingUrl(sourceUrl, listingSource)) {
    const again = classifyInvalidSourceUrl(sourceUrl) ?? "invalid_source_page";
    return { ok: false, reason: again };
  }

  let title = sanitizeOfferText(input.title);
  if (!title || title.length < 3) title = titleFromListingUrl(sourceUrl);
  if (!title || title.length < 3 || hasBadEncoding(title)) {
    return { ok: false, reason: "missing_required_fields" };
  }
  if (isGenericOfferTitle(title)) return { ok: false, reason: "generic_title" };

  return {
    ok: true,
    input: {
      ...input,
      title,
      sourceName: listingSource,
      sourceUrl,
    },
  };
}

export function inputFromSourceOfferFields(fields: {
  title: string;
  price: string | null;
  priceAmount?: number | null;
  priceText?: string | null;
  city: string;
  region: string;
  categorySlug: string;
  companyName: string;
  sellerName: string;
  brand: string | null;
  oemCodes: string[];
  articleCodes: string[];
  sourceName: CatalogSourceName;
  sourceUrl: string;
  shortSnippet: string;
  offerType?: import("./catalogSourceOfferType").CatalogSourceOfferType;
  coverImageUrl?: string | null;
  confidenceScore?: number;
  rawPayload?: Record<string, unknown>;
}): CatalogSourceOfferInput {
  return {
    title: fields.title,
    price: fields.price,
    priceAmount: fields.priceAmount ?? null,
    priceText: fields.priceText ?? null,
    city: fields.city,
    region: fields.region,
    categorySlug: fields.categorySlug,
    companyName: fields.companyName,
    sellerName: fields.sellerName,
    brand: fields.brand,
    oemCodes: fields.oemCodes,
    articleCodes: fields.articleCodes,
    sourceName: fields.sourceName,
    sourceUrl: fields.sourceUrl,
    shortSnippet: fields.shortSnippet,
    offerType: fields.offerType ?? "other",
    coverImageUrl: fields.coverImageUrl ?? null,
    confidenceScore: fields.confidenceScore ?? 0.5,
    rawPayload: fields.rawPayload,
  };
}
