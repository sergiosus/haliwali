import type { OfferSearchResponse, OfferSearchResultItem } from "./catalogOfferAdminSearch";
import type { OfferSearchSourceFilter } from "./catalogOfferAdminSearch";

export type PersistedOfferSearchSession = {
  id: number;
  query: string;
  city: string;
  brand: string;
  oemArticle: string;
  sourceFilter: OfferSearchSourceFilter;
  priceMin?: number;
  priceMax?: number;
  results: OfferSearchResultItem[];
  skipped: OfferSearchResultItem[];
  message?: string;
  emptyReason?: string | null;
  stats: OfferSearchResponse["stats"];
  createdAt: string;
  updatedAt: string;
};

export type OfferSearchSessionPayload = Omit<PersistedOfferSearchSession, "id" | "createdAt" | "updatedAt">;
