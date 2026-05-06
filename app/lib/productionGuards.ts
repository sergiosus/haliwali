export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Fail fast if a production runtime codepath relies on file/JSON stores for core data.
 * Use this in server-side stores that still touch `.data/*` or other local filesystem state.
 */
export function assertFileStoreNotUsedInProduction(feature: string, details?: Record<string, unknown>): void {
  if (!isProduction()) return;
  const extra = details ? ` details=${JSON.stringify(details)}` : "";
  throw new Error(`[haliwali] File/JSON store is not allowed in production: ${feature}.${extra}`);
}

