/** External marketplace links (official APIs / licensed feeds only). Default: off. */
export function isExternalSearchEnabled(): boolean {
  return process.env.ENABLE_EXTERNAL_SEARCH === "true";
}

/** Privacy-safe internal search logs (no IP, no user id). Default: off. */
export function isSearchAnalyticsEnabled(): boolean {
  return process.env.ENABLE_SEARCH_ANALYTICS === "true";
}
