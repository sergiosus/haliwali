import { isExternalSearchEnabled } from "./searchFeatureFlags";

/** Minimal external result — no copied descriptions, no hotlinked images by default. */
export type ExternalSearchResultItem = {
  title: string;
  sourceName: string;
  snippet: string | null;
  externalUrl: string;
};

/**
 * Safe external search scaffold. Providers must be official APIs, RSS, or partner feeds only.
 * Not enabled by default (`ENABLE_EXTERNAL_SEARCH=false`).
 */
export async function fetchExternalSearchResults(_query: string): Promise<ExternalSearchResultItem[]> {
  if (!isExternalSearchEnabled()) return [];
  // No providers wired — enable only after integrating a licensed/official feed.
  return [];
}
