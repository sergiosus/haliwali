import type { CatalogSocialLink, CatalogSourceType } from "./catalogExtractionTypes";

export type CatalogImportDraftStatus = "new" | "saved" | "published" | "rejected";

/** @deprecated Legacy DB values mapped on read */
export type CatalogImportDraftStatusLegacy = "draft" | "approved";

export type CatalogImportSession = {
  id: number;
  query: string;
  city: string;
  categorySlug: string;
  resultCount: number;
  createdAt: string;
};

export function normalizeDraftStatus(raw: string): CatalogImportDraftStatus {
  if (raw === "new" || raw === "saved" || raw === "published" || raw === "rejected") return raw;
  if (raw === "draft") return "new";
  if (raw === "approved") return "saved";
  return "new";
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
