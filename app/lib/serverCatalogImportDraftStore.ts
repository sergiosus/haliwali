import { logCatalogImport } from "./catalogCatalogLog";
import { usesPostgres } from "./pgPool";
import type {
  CatalogImportDraft,
  CatalogImportDraftInput,
  CatalogImportDraftStatus,
  CatalogImportUpsertResult,
} from "./catalogImportTypes";
import * as pg from "./serverCatalogImportDraftPg";
import * as json from "./serverCatalogImportDraftJson";

/** When Postgres is configured, always use PG (no silent JSON fallback). */
async function withPg<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return fallback();
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logCatalogImport("pg_store_error", { error: msg.slice(0, 300) });
    throw e;
  }
}

export async function listCatalogImportDrafts(opts?: {
  status?: CatalogImportDraftStatus;
}): Promise<CatalogImportDraft[]> {
  return withPg(() => pg.pgListImportDrafts(opts), () => json.jsonListImportDrafts(opts));
}

export async function updateCatalogImportDraft(
  id: number,
  patch: Partial<CatalogImportDraftInput> & { status?: CatalogImportDraftStatus },
): Promise<CatalogImportDraft | null> {
  return withPg(() => pg.pgUpdateImportDraft(id, patch), () => json.jsonUpdateImportDraft(id, patch));
}

export async function setCatalogImportDraftStatuses(
  ids: number[],
  status: CatalogImportDraftStatus,
): Promise<number> {
  return withPg(() => pg.pgSetImportDraftStatuses(ids, status), () => json.jsonSetImportDraftStatuses(ids, status));
}

export async function publishCatalogImportDrafts(ids: number[]): Promise<{
  published: number;
  skipped: number;
  slugs: string[];
}> {
  return withPg(() => pg.pgPublishImportDrafts(ids), () => json.jsonPublishImportDrafts(ids));
}

export async function mergeCatalogImportDraft(
  draftId: number,
  companyId: number,
): Promise<CatalogImportDraft | null> {
  return withPg(
    () => pg.pgMergeDraftIntoCompany(draftId, companyId),
    () => json.jsonMergeDraftIntoCompany(draftId, companyId),
  );
}

export async function saveCatalogImportDraft(
  id: number,
  patch: Partial<CatalogImportDraftInput>,
): Promise<CatalogImportDraft | null> {
  return withPg(() => pg.pgSaveImportDraft(id, patch), () => json.jsonSaveImportDraft(id, patch));
}

export async function deleteCatalogImportDrafts(ids: number[]): Promise<number> {
  return withPg(() => pg.pgDeleteImportDrafts(ids), () => json.jsonDeleteImportDrafts(ids));
}

export async function countCatalogImportDraftsInDb(): Promise<number> {
  return withPg(() => pg.pgCountImportDrafts(), () => json.jsonCountImportDrafts());
}

export async function upsertExtractedDraftsWithMeta(
  items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
    existingDraftId?: number;
  }[],
): Promise<CatalogImportUpsertResult> {
  return withPg(
    () => pg.pgUpsertImportDraftsWithMeta(items),
    () => json.jsonUpsertImportDraftsWithMeta(items),
  );
}
