import type { CatalogSocialLink, CatalogSourceType } from "./catalogExtractionTypes";

/** Canonical statuses stored in catalog_company_import_drafts.status */
export type CatalogImportDraftStatus = "draft" | "saved" | "approved" | "rejected" | "published";

export type CatalogImportSession = {
  id: number;
  query: string;
  city: string;
  categorySlug: string;
  resultCount: number;
  createdAt: string;
};

/** Map DB / legacy values to canonical status for API + UI. */
export function normalizeDraftStatus(raw: string): CatalogImportDraftStatus {
  const s = raw.trim().toLowerCase();
  if (s === "draft" || s === "saved" || s === "approved" || s === "rejected" || s === "published") {
    return s;
  }
  if (s === "new") return "draft";
  return "draft";
}

/** Values accepted in list filter (includes legacy aliases). */
export function draftStatusDbValues(canonical: CatalogImportDraftStatus): string[] {
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
    default:
      return ["draft"];
  }
}

export type CatalogImportDraftInput = {
  name: string;
  categorySlug: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  socialLinks?: CatalogSocialLink[];
  confidenceScore?: number;
  rawPayload?: Record<string, unknown>;
};

export type CatalogImportDraft = CatalogImportDraftInput & {
  id: number;
  status: CatalogImportDraftStatus;
  sourceId: number | null;
  sourceType: CatalogSourceType | null;
  sourceUrlDisplay: string | null;
  duplicateHint: string | null;
  duplicateOfCompanyId: number | null;
  needsReview: boolean;
  publishedCompanySlug: string | null;
  warnings: string[];
  socialLinks: CatalogSocialLink[];
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogImportParseKind = "csv" | "text" | "url" | "urls";

export type CatalogImportUpsertResult = {
  drafts: CatalogImportDraft[];
  createdIds: number[];
  updatedIds: number[];
  sourcesCreated: number;
};
