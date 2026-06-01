import type {
  CatalogSourceOfferListQuery,
  CatalogSourceOfferListResult,
} from "./catalogSourceOfferQuery";
import { usesPostgres } from "./pgPool";
import type {
  CatalogSourceOffer,
  CatalogSourceOfferDraft,
  CatalogSourceOfferDraftStatus,
  CatalogSourceOfferInput,
  CatalogSourceOfferUpsertResult,
} from "./catalogSourceOfferTypes";
import * as pg from "./serverCatalogSourceOfferPg";

function assertPostgres(): void {
  if (!usesPostgres()) {
    throw new Error(
      "[haliwali] DATABASE_URL is required for catalog source offers (PostgreSQL only, no file store).",
    );
  }
}

export async function listSourceOfferDrafts(
  status?: CatalogSourceOfferDraftStatus,
): Promise<CatalogSourceOfferDraft[]> {
  assertPostgres();
  return pg.pgListSourceOfferDrafts(status);
}

export async function upsertSourceOfferDrafts(
  items: {
    input: CatalogSourceOfferInput;
    duplicateHint: string | null;
    duplicateOfOfferId: number | null;
    existingDraftId?: number;
  }[],
): Promise<CatalogSourceOfferUpsertResult> {
  assertPostgres();
  return pg.pgUpsertSourceOfferDrafts(items);
}

export async function setSourceOfferDraftStatuses(
  ids: number[],
  status: CatalogSourceOfferDraftStatus,
): Promise<number> {
  assertPostgres();
  return pg.pgSetSourceOfferDraftStatuses(ids, status);
}

export async function publishSourceOfferDrafts(ids: number[]): Promise<CatalogSourceOfferDraft[]> {
  assertPostgres();
  return pg.pgPublishSourceOfferDrafts(ids);
}

export async function listPublishedSourceOffers(
  opts?: CatalogSourceOfferListQuery,
): Promise<CatalogSourceOfferListResult> {
  assertPostgres();
  return pg.pgListPublishedSourceOffers(opts);
}

export async function loadSourceOfferDedupSeed() {
  assertPostgres();
  return pg.pgLoadSourceOfferDedupSeed();
}

export type CatalogSourceOfferAdminStatus = {
  tablesReady: boolean;
  publishedCount: number;
  /** @deprecated use candidatesCount */
  importCount: number;
  candidatesCount: number;
  rejectedCount: number;
  duplicateCount: number;
  dbError?: string;
};

export async function getSourceOfferAdminStatus(): Promise<CatalogSourceOfferAdminStatus> {
  const empty: CatalogSourceOfferAdminStatus = {
    tablesReady: false,
    publishedCount: 0,
    importCount: 0,
    candidatesCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
  };

  if (!usesPostgres()) {
    return {
      ...empty,
      dbError: "DATABASE_URL is not configured",
    };
  }

  try {
    const tablesReady = await pg.pgCheckSourceOffersTablesReady();
    if (!tablesReady) {
      return { ...empty, dbError: "catalog_source_offers or catalog_source_offer_import_drafts missing" };
    }

    let publishedCount = 0;
    let queues = { candidates: 0, rejected: 0, duplicate: 0 };
    try {
      [publishedCount, queues] = await Promise.all([
        pg.pgCountPublishedSourceOffers(),
        pg.pgCountSourceOfferDraftQueues(),
      ]);
    } catch (countErr) {
      const msg = countErr instanceof Error ? countErr.message : String(countErr);
      return {
        tablesReady: true,
        publishedCount: 0,
        importCount: 0,
        candidatesCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        dbError: msg,
      };
    }

    return {
      tablesReady: true,
      publishedCount,
      importCount: queues.candidates,
      candidatesCount: queues.candidates,
      rejectedCount: queues.rejected,
      duplicateCount: queues.duplicate,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...empty, dbError: msg };
  }
}

export async function deletePublishedSourceOffers(ids: number[]): Promise<number> {
  assertPostgres();
  return pg.pgDeletePublishedSourceOffers(ids);
}

export async function introspectSourceOfferDb() {
  assertPostgres();
  return pg.pgIntrospectSourceOfferDb();
}
