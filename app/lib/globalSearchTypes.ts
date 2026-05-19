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
};

export type GlobalSearchSuggestItem = {
  kind: "listing" | "category" | "city";
  label: string;
  query: string;
};

export type GlobalSearchScopeParams = {
  scope: SearchScopeLocation;
};
