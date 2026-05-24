export type CatalogSourceType = "website" | "directory" | "vk" | "listing" | "text" | "csv";

export type CatalogImportSourceStatus = "pending" | "parsed" | "failed";

export type CatalogImportSource = {
  id: number;
  sourceUrl: string;
  sourceType: CatalogSourceType;
  status: CatalogImportSourceStatus;
  errorMessage: string | null;
  createdAt: string;
};

export type CatalogSocialLink = {
  type: "vk" | "telegram" | "instagram" | "facebook" | "youtube" | "other";
  url: string;
};

export type ExtractedCompanyDraft = {
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
  sourceUrl: string;
  socialLinks: CatalogSocialLink[];
  confidenceScore: number;
  rawPayload: Record<string, unknown>;
};

export type ExtractionDefaults = {
  categorySlug: string;
  city: string;
};

export type ExtractionBatchResult = {
  sources: CatalogImportSource[];
  drafts: import("./catalogImportTypes").CatalogImportDraft[];
  errors: { url: string; error: string }[];
};
