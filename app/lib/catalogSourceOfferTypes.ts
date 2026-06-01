/** Marketplace sources — single canonical list for search, parsers, and URL classification. */
export const CATALOG_MARKETPLACE_SOURCES = ["avito", "auto_ru", "drom", "vk", "youla"] as const;

export type CatalogMarketplaceSourceName = (typeof CATALOG_MARKETPLACE_SOURCES)[number];

/** Alias for marketplace search parsers (same ids as {@link CatalogMarketplaceSourceName}). */
export type OfferListingSourceId = CatalogMarketplaceSourceName;

export const CATALOG_NON_MARKETPLACE_SOURCES = ["company_site", "other"] as const;

export type CatalogNonMarketplaceSourceName = (typeof CATALOG_NON_MARKETPLACE_SOURCES)[number];

/** All {@link CatalogSourceOfferInput.sourceName} values. */
export const CATALOG_SOURCE_NAMES = [
  ...CATALOG_MARKETPLACE_SOURCES,
  ...CATALOG_NON_MARKETPLACE_SOURCES,
] as const;

/** External marketplace / site identifier for indexed offers. */
export type CatalogSourceName = CatalogMarketplaceSourceName | CatalogNonMarketplaceSourceName;

export function isCatalogMarketplaceSourceName(
  value: string,
): value is CatalogMarketplaceSourceName {
  return (CATALOG_MARKETPLACE_SOURCES as readonly string[]).includes(value);
}

export function isCatalogSourceName(value: string): value is CatalogSourceName {
  return (CATALOG_SOURCE_NAMES as readonly string[]).includes(value);
}

export function parseCatalogSourceName(
  raw: string | null | undefined,
): CatalogSourceName | undefined {
  const s = raw?.trim();
  return s && isCatalogSourceName(s) ? s : undefined;
}

export type { SourceOfferRejectReason } from "./catalogSourceOfferValidation";
export { SOURCE_OFFER_REJECT_LABELS, sourceOfferRejectLabel } from "./catalogSourceOfferValidation";

export type { CatalogSourceOfferType, OfferTypeFilter } from "./catalogSourceOfferType";
export {
  CATALOG_SOURCE_OFFER_TYPES,
  OFFER_TYPE_LABELS,
  inferOfferType,
  parseCatalogSourceOfferType,
} from "./catalogSourceOfferType";

/** Canonical draft statuses (maps UI «new» → draft). */
export type CatalogSourceOfferDraftStatus =
  | "draft"
  | "saved"
  | "approved"
  | "rejected"
  | "published"
  | "duplicate";

export type CatalogSourceOfferInput = {
  title: string;
  price: string | null;
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
  offerType: import("./catalogSourceOfferType").CatalogSourceOfferType;
  /** Single cover thumbnail — no galleries. */
  coverImageUrl: string | null;
  confidenceScore: number;
  rawPayload?: Record<string, unknown>;
  /** @deprecated use coverImageUrl */
  imageUrl?: string | null;
};

export type CatalogSourceOfferDraft = CatalogSourceOfferInput & {
  id: number;
  status: CatalogSourceOfferDraftStatus;
  duplicateHint: string | null;
  duplicateOfOfferId: number | null;
  publishedOfferId: number | null;
  titleSearch: string;
  brandSearch: string;
  oemSearch: string;
  companySearch: string;
  citySearch: string;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogSourceOffer = CatalogSourceOfferInput & {
  id: number;
  haliwaliCompanyId: number | null;
  titleSearch: string;
  brandSearch: string;
  oemSearch: string;
  companySearch: string;
  citySearch: string;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogSourceOfferUpsertResult = {
  drafts: CatalogSourceOfferDraft[];
  createdIds: number[];
  updatedIds: number[];
};

export function normalizeSourceOfferDraftStatus(raw: string): CatalogSourceOfferDraftStatus {
  const s = raw.trim().toLowerCase();
  if (
    s === "draft" ||
    s === "saved" ||
    s === "approved" ||
    s === "rejected" ||
    s === "published" ||
    s === "duplicate"
  ) {
    return s;
  }
  if (s === "new") return "draft";
  return "draft";
}

export function sourceOfferDraftStatusDbValues(canonical: CatalogSourceOfferDraftStatus): string[] {
  switch (canonical) {
    case "draft":
      return ["draft", "new"];
    case "saved":
      return ["saved"];
    case "approved":
      return ["approved"];
    case "rejected":
      return ["rejected"];
    case "published":
      return ["published"];
    case "duplicate":
      return ["duplicate"];
    default:
      return ["draft"];
  }
}
