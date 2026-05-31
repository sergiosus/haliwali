import type { CatalogSourceOfferListQuery } from "./catalogSourceOfferQuery";
import { usesPostgres } from "./pgPool";
import type {
  CatalogSourceOffer,
  CatalogSourceOfferDraft,
  CatalogSourceOfferDraftStatus,
  CatalogSourceOfferInput,
  CatalogSourceOfferUpsertResult,
} from "./catalogSourceOfferTypes";
import * as json from "./serverCatalogSourceOfferJson";
import * as pg from "./serverCatalogSourceOfferPg";

async function withStore<T>(pgFn: () => Promise<T>, jsonFn: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return jsonFn();
  try {
    return await pgFn();
  } catch {
    return jsonFn();
  }
}

export async function listSourceOfferDrafts(
  status?: CatalogSourceOfferDraftStatus,
): Promise<CatalogSourceOfferDraft[]> {
  return withStore(
    () => pg.pgListSourceOfferDrafts(status),
    () => json.jsonListSourceOfferDrafts(status),
  );
}

export async function upsertSourceOfferDrafts(
  items: {
    input: CatalogSourceOfferInput;
    duplicateHint: string | null;
    duplicateOfOfferId: number | null;
    existingDraftId?: number;
  }[],
): Promise<CatalogSourceOfferUpsertResult> {
  return withStore(
    () => pg.pgUpsertSourceOfferDrafts(items),
    () => json.jsonUpsertSourceOfferDrafts(items),
  );
}

export async function setSourceOfferDraftStatuses(
  ids: number[],
  status: CatalogSourceOfferDraftStatus,
): Promise<number> {
  return withStore(
    () => pg.pgSetSourceOfferDraftStatuses(ids, status),
    () => json.jsonSetSourceOfferDraftStatuses(ids, status),
  );
}

export async function publishSourceOfferDrafts(ids: number[]): Promise<CatalogSourceOfferDraft[]> {
  return withStore(
    () => pg.pgPublishSourceOfferDrafts(ids),
    () => json.jsonPublishSourceOfferDrafts(ids),
  );
}

export async function listPublishedSourceOffers(
  opts?: CatalogSourceOfferListQuery,
): Promise<CatalogSourceOffer[]> {
  return withStore(
    () => pg.pgListPublishedSourceOffers(opts),
    () => json.jsonListPublishedSourceOffers(opts),
  );
}

export async function loadSourceOfferDedupSeed() {
  return withStore(() => pg.pgLoadSourceOfferDedupSeed(), () => json.jsonLoadSourceOfferDedupSeed());
}

export type CatalogSourceOfferAdminStatus = {
  tablesReady: boolean;
  publishedCount: number;
  /** @deprecated use candidatesCount */
  importCount: number;
  candidatesCount: number;
  rejectedCount: number;
  duplicateCount: number;
};

export async function getSourceOfferAdminStatus(): Promise<CatalogSourceOfferAdminStatus> {
  if (!usesPostgres()) {
    const [publishedCount, queues] = await Promise.all([
      json.jsonCountPublishedSourceOffers(),
      json.jsonCountSourceOfferDraftQueues(),
    ]);
    return {
      tablesReady: true,
      publishedCount,
      importCount: queues.candidates,
      candidatesCount: queues.candidates,
      rejectedCount: queues.rejected,
      duplicateCount: queues.duplicate,
    };
  }
  try {
    const tablesReady = await pg.pgCheckSourceOffersTablesReady();
    if (!tablesReady) {
      return {
        tablesReady: false,
        publishedCount: 0,
        importCount: 0,
        candidatesCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
      };
    }
    const [publishedCount, queues] = await Promise.all([
      pg.pgCountPublishedSourceOffers(),
      pg.pgCountSourceOfferDraftQueues(),
    ]);
    return {
      tablesReady: true,
      publishedCount,
      importCount: queues.candidates,
      candidatesCount: queues.candidates,
      rejectedCount: queues.rejected,
      duplicateCount: queues.duplicate,
    };
  } catch {
    return {
      tablesReady: false,
      publishedCount: 0,
      importCount: 0,
      candidatesCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
    };
  }
}

export async function deletePublishedSourceOffers(ids: number[]): Promise<number> {
  return withStore(
    () => pg.pgDeletePublishedSourceOffers(ids),
    () => json.jsonDeletePublishedSourceOffers(ids),
  );
}
