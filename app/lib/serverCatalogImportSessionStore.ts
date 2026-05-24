import { usesPostgres } from "./pgPool";
import type { CatalogImportSession } from "./catalogImportTypes";
import * as pg from "./serverCatalogImportDraftPg";
import * as json from "./serverCatalogImportSessionJson";

async function withPg<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return fallback();
  try {
    return await fn();
  } catch (e) {
    if (process.env.NODE_ENV === "production") throw e;
    return fallback();
  }
}

export async function recordCatalogImportSession(input: {
  query: string;
  city: string;
  categorySlug: string;
  resultCount: number;
}): Promise<CatalogImportSession | null> {
  try {
    return await withPg(
      () => pg.pgCreateImportSession(input),
      () => json.jsonCreateImportSession(input),
    );
  } catch {
    return null;
  }
}

export async function listCatalogImportSessions(limit = 30): Promise<CatalogImportSession[]> {
  return withPg(() => pg.pgListImportSessions(limit), () => json.jsonListImportSessions(limit));
}
