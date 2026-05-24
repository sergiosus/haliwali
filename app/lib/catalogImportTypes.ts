import type { CatalogSocialLink, CatalogSourceType } from "./catalogExtractionTypes";

export type CatalogImportDraftStatus = "draft" | "approved" | "rejected" | "published";

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
