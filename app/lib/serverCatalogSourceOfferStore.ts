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

export async function listCandidateSourceOfferDrafts(): Promise<CatalogSourceOfferDraft[]> {
  assertPostgres();
  return pg.pgListCandidateSourceOfferDrafts();
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

export async function deleteSourceOfferDrafts(ids: number[]): Promise<number> {
  assertPostgres();
  return pg.pgDeleteSourceOfferDrafts(ids);
}

export async function listPublishedSourceOffers(
  opts?: CatalogSourceOfferListQuery,
): Promise<CatalogSourceOfferListResult> {
  assertPostgres();
  return pg.pgListPublishedSourceOffers(opts);
}

export async function getPublishedSourceOfferById(id: number): Promise<CatalogSourceOffer | null> {
  assertPostgres();
  return pg.pgGetPublishedSourceOfferById(id);
}

export async function listPublishedSourceOfferIdsForSitemap(): Promise<number[]> {
  assertPostgres();
  return pg.pgListPublishedSourceOfferIdsForSitemap();
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
  schemaMissing?: string[];
  /** Temporary diagnostics — publish vs public list alignment. */
  publishedOffersCountFromDb?: number;
  publicApiCount?: number;
  draftsApprovedCount?: number;
  draftsPublishedCount?: number;
  tableUsedByAdmin?: string;
  tableUsedByPublicApi?: string;
  listQueryError?: string;
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
    const schema = await pg.pgCheckSourceOfferSchemaReady();
    if (!schema.ready) {
      const hint =
        schema.missing.length > 0 ?
          schema.missing.join(", ")
        : "catalog_source_offers or catalog_source_offer_import_drafts missing";
      return {
        ...empty,
        tablesReady: schema.tablesExist,
        dbError: schema.tablesExist ?
          `Missing columns — run db/migrations/20260602_source_offer_price_fields.sql (${hint})`
        : `Missing tables — run db/migrations/20260531_catalog_source_offers.sql (${hint})`,
        schemaMissing: schema.missing,
      };
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

    let syncDebug: Awaited<ReturnType<typeof pg.pgGetSourceOfferSyncDebug>> | undefined;
    try {
      syncDebug = await pg.pgGetSourceOfferSyncDebug();
    } catch {
      syncDebug = undefined;
    }

    return {
      tablesReady: schema.ready,
      publishedCount,
      importCount: queues.candidates,
      candidatesCount: queues.candidates,
      rejectedCount: queues.rejected,
      duplicateCount: queues.duplicate,
      publishedOffersCountFromDb: syncDebug?.publishedOffersCountFromDb ?? publishedCount,
      publicApiCount: syncDebug?.publicApiCount,
      draftsApprovedCount: syncDebug?.draftsApprovedCount,
      draftsPublishedCount: syncDebug?.draftsPublishedCount,
      tableUsedByAdmin: syncDebug?.tableUsedByAdmin ?? "catalog_source_offers",
      tableUsedByPublicApi: syncDebug?.tableUsedByPublicApi ?? "catalog_source_offers",
      listQueryError: syncDebug?.listQueryError,
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
