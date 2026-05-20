import type { SearchScopeLocation } from "./searchScopeLocation";

export type GlobalSearchListingTypeFilter = "all" | "task" | "service" | "product";

export type GlobalSearchResultItem = {
  id: string;
  type: "task" | "service" | "product";
  title: string;
  descriptionSnippet: string;
  category: string;
  subcategory: string;
  city: string;
  region: string;
  imageUrl: string | null;
  href: string;
  score: number;
  /** Server-only tie-break for autocomplete / equal score ordering. */
  listingCreatedAtMs?: number;
};

export type GlobalSearchSuggestItem = {
  kind: "listing" | "category" | "city";
  label: string;
  query: string;
  /** Set for listing rows returned by `/api/search/suggest` (header). */
  listingType?: "task" | "service" | "product";
  /** Present for listing suggestions — navigate to listing detail on pick. */
  listingId?: string;
  href?: string;
  city?: string;
  /** Short category/spec line for dropdown (no long description). */
  categoryLabel?: string;
};

export type GlobalSearchScopeParams = {
  scope: SearchScopeLocation;
};
