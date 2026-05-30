/** External marketplace / site identifier for indexed offers. */
export type CatalogSourceName = "avito" | "drom" | "vk" | "company_site" | "other";

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
  confidenceScore: number;
  rawPayload?: Record<string, unknown>;
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
