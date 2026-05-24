import { usesPostgres } from "./pgPool";
import type { CatalogImportDraft, CatalogImportDraftInput } from "./catalogImportTypes";
import type { CatalogImportSource, CatalogSourceType } from "./catalogExtractionTypes";
import * as pg from "./serverCatalogImportDraftPg";
import * as json from "./serverCatalogImportDraftJson";

async function withPg<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return fallback();
  try {
    return await fn();
  } catch (e) {
    if (process.env.NODE_ENV === "production") throw e;
    return fallback();
  }
}

export async function createImportSource(
  sourceUrl: string,
  sourceType: CatalogSourceType,
): Promise<CatalogImportSource> {
  return withPg(
    () => pg.pgCreateImportSource(sourceUrl, sourceType),
    () => json.jsonCreateImportSource(sourceUrl, sourceType),
  );
}

export async function parsedImportSource(id: number): Promise<void> {
  return withPg(
    () => pg.pgUpdateImportSourceStatus(id, "parsed", null),
    () => json.jsonUpdateImportSourceStatus(id, "parsed", null),
  );
}

export async function failImportSource(id: number, error: string): Promise<void> {
  return withPg(
    () => pg.pgUpdateImportSourceStatus(id, "failed", error.slice(0, 500)),
    () => json.jsonUpdateImportSourceStatus(id, "failed", error.slice(0, 500)),
  );
}

export async function loadDedupSeedData(): Promise<{
  published: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
  drafts: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
}> {
  return withPg(() => pg.pgLoadDedupSeedData(), () => json.jsonLoadDedupSeedData());
}

export async function saveExtractedDrafts(
  items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
  }[],
): Promise<CatalogImportDraft[]> {
  return withPg(() => pg.pgInsertImportDraftsV2(items), () => json.jsonInsertImportDraftsV2(items));
}

export async function upsertExtractedDrafts(
  items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
    existingDraftId?: number;
  }[],
): Promise<CatalogImportDraft[]> {
  return withPg(() => pg.pgUpsertImportDraftsV2(items), () => json.jsonUpsertImportDraftsV2(items));
}

export async function mergeDraftIntoCompany(
  draftId: number,
  companyId: number,
): Promise<CatalogImportDraft | null> {
  return withPg(
    () => pg.pgMergeDraftIntoCompany(draftId, companyId),
    () => json.jsonMergeDraftIntoCompany(draftId, companyId),
  );
}
