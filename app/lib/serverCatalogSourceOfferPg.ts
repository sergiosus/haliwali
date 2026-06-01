import { getPool } from "./pgPool";
import type {
  CatalogSourceOffer,
  CatalogSourceOfferDraft,
  CatalogSourceOfferDraftStatus,
  CatalogSourceOfferInput,
} from "./catalogSourceOfferTypes";
import {
  normalizeSourceOfferDraftStatus,
  sourceOfferDraftStatusDbValues,
} from "./catalogSourceOfferTypes";
import type {
  CatalogSourceOfferListQuery,
  CatalogSourceOfferListResult,
} from "./catalogSourceOfferQuery";
import { buildSourceOfferSearchFields } from "./catalogSourceOfferSearchFields";
import { sanitizeSourceOfferInput } from "./catalogSourceOfferNormalize";
import { resolveOfferTypeForStorage } from "./catalogSourceOfferType";
import {
  formatSourceOfferRejectHint,
  inputFromSourceOfferFields,
  isPublicListableSourceOffer,
  validateSourceOfferInput,
  type SourceOfferRejectReason,
} from "./catalogSourceOfferValidation";
import {
  effectiveOfferType,
  parseCatalogSourceOfferType,
  sqlEffectiveOfferTypeMatch,
} from "./catalogSourceOfferType";
import type { CatalogSourceName } from "./catalogSourceOfferTypes";
import {
  rawPayloadForDb,
  resolveCoverImageUrl,
  SOURCE_OFFER_DRAFT_SELECT_COLS,
  SOURCE_OFFER_PUBLISHED_SELECT_COLS,
  SOURCE_OFFER_PUBLISHED_SELECT_COLS_LEGACY,
  CATALOG_SOURCE_OFFERS_TABLE,
  CATALOG_SOURCE_OFFER_DRAFTS_TABLE,
} from "./catalogSourceOfferDbColumns";

type DraftRow = {
  id: number;
  status: string;
  offer_type: string;
  title: string;
  price: string | null;
  city: string;
  region: string;
  category_slug: string;
  company_name: string;
  seller_name: string;
  brand: string | null;
  oem_codes: string[];
  article_codes: string[];
  source_name: string;
  source_url: string;
  short_snippet: string;
  cover_image_url: string | null;
  confidence_score: number;
  duplicate_hint: string | null;
  duplicate_of_offer_id: number | null;
  published_offer_id: number | null;
  title_search: string;
  brand_search: string;
  oem_search: string;
  company_search: string;
  city_search: string;
  raw_payload: Record<string, unknown>;
  imported_at: Date;
  created_at: Date;
  updated_at: Date;
};

type OfferRow = Omit<
  DraftRow,
  "status" | "duplicate_hint" | "duplicate_of_offer_id" | "published_offer_id" | "raw_payload" | "offer_type" | "cover_image_url"
> & {
  draft_id: number | null;
  haliwali_company_id: number | null;
  offer_type?: string;
  cover_image_url?: string | null;
};

function isMissingColumnDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column .* does not exist/i.test(msg) || /undefined column/i.test(msg);
}

async function queryPublishedOfferRows(
  pool: ReturnType<typeof getPool>,
  where: string,
  params: unknown[],
  limit: number,
  offset: number,
): Promise<OfferRow[]> {
  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;
  const sql = (cols: string) => `
    SELECT ${cols}
    FROM catalog_source_offers
    ${where}
    ORDER BY imported_at DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
  `;

  try {
    const { rows } = await pool.query<OfferRow>(sql(SOURCE_OFFER_PUBLISHED_SELECT_COLS), listParams);
    return rows;
  } catch (err) {
    if (!isMissingColumnDbError(err)) throw err;
    const { rows } = await pool.query<OfferRow>(sql(SOURCE_OFFER_PUBLISHED_SELECT_COLS_LEGACY), listParams);
    return rows;
  }
}

function parseCodes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

function rowToDraft(r: DraftRow): CatalogSourceOfferDraft {
  const coverImageUrl = resolveCoverImageUrl({
    coverImageUrl: r.cover_image_url,
    rawPayload: r.raw_payload,
  });
  return {
    id: r.id,
    status: normalizeSourceOfferDraftStatus(r.status),
    offerType: effectiveOfferType(r.offer_type, {
      title: r.title,
      sourceUrl: r.source_url,
      brand: r.brand,
      oemCodes: parseCodes(r.oem_codes),
      articleCodes: parseCodes(r.article_codes),
    }),
    title: r.title,
    price: r.price,
    city: r.city,
    region: r.region,
    categorySlug: r.category_slug,
    companyName: r.company_name,
    sellerName: r.seller_name,
    brand: r.brand,
    oemCodes: parseCodes(r.oem_codes),
    articleCodes: parseCodes(r.article_codes),
    sourceName: r.source_name as CatalogSourceOfferDraft["sourceName"],
    sourceUrl: r.source_url,
    shortSnippet: r.short_snippet,
    coverImageUrl,
    confidenceScore: r.confidence_score,
    duplicateHint: r.duplicate_hint,
    duplicateOfOfferId: r.duplicate_of_offer_id,
    publishedOfferId: r.published_offer_id,
    titleSearch: r.title_search,
    brandSearch: r.brand_search,
    oemSearch: r.oem_search,
    companySearch: r.company_search,
    citySearch: r.city_search,
    rawPayload: r.raw_payload ?? {},
    importedAt: r.imported_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function draftRowToInput(r: DraftRow): ReturnType<typeof inputFromSourceOfferFields> {
  return inputFromSourceOfferFields({
    offerType: effectiveOfferType(r.offer_type, {
      title: r.title,
      sourceUrl: r.source_url,
      brand: r.brand,
      oemCodes: parseCodes(r.oem_codes),
      articleCodes: parseCodes(r.article_codes),
    }),
    title: r.title,
    price: r.price,
    city: r.city,
    region: r.region,
    categorySlug: r.category_slug,
    companyName: r.company_name,
    sellerName: r.seller_name,
    brand: r.brand,
    oemCodes: parseCodes(r.oem_codes),
    articleCodes: parseCodes(r.article_codes),
    sourceName: r.source_name as CatalogSourceName,
    sourceUrl: r.source_url,
    shortSnippet: r.short_snippet,
    coverImageUrl: resolveCoverImageUrl({
      coverImageUrl: r.cover_image_url,
      rawPayload: r.raw_payload,
    }),
    confidenceScore: r.confidence_score,
    rawPayload: r.raw_payload ?? {},
  });
}

function offerRowToInput(r: OfferRow): ReturnType<typeof inputFromSourceOfferFields> {
  return inputFromSourceOfferFields({
    offerType: effectiveOfferType(r.offer_type, {
      title: r.title,
      sourceUrl: r.source_url,
      brand: r.brand,
      oemCodes: parseCodes(r.oem_codes),
      articleCodes: parseCodes(r.article_codes),
    }),
    title: r.title,
    price: r.price,
    city: r.city,
    region: r.region,
    categorySlug: r.category_slug,
    companyName: r.company_name,
    sellerName: r.seller_name,
    brand: r.brand,
    oemCodes: parseCodes(r.oem_codes),
    articleCodes: parseCodes(r.article_codes),
    sourceName: r.source_name as CatalogSourceName,
    sourceUrl: r.source_url,
    shortSnippet: r.short_snippet,
    coverImageUrl: resolveCoverImageUrl({ coverImageUrl: r.cover_image_url }),
    confidenceScore: r.confidence_score,
  });
}

async function pgRejectDraftWithReason(
  pool: ReturnType<typeof getPool>,
  id: number,
  reason: SourceOfferRejectReason,
): Promise<CatalogSourceOfferDraft | null> {
  const { rows } = await pool.query<DraftRow>(
    `
    UPDATE catalog_source_offer_import_drafts SET
      status = 'rejected',
      duplicate_hint = $2,
      published_offer_id = NULL,
      updated_at = NOW()
    WHERE id = $1
    RETURNING ${DRAFT_COLS}
    `,
    [id, formatSourceOfferRejectHint(reason)],
  );
  return rows[0] ? rowToDraft(rows[0]) : null;
}

function rowToOffer(r: OfferRow): CatalogSourceOffer {
  const coverImageUrl = resolveCoverImageUrl({ coverImageUrl: r.cover_image_url ?? null });
  return {
    id: r.id,
    offerType: effectiveOfferType(r.offer_type ?? "other", {
      title: r.title,
      sourceUrl: r.source_url,
      brand: r.brand,
      oemCodes: parseCodes(r.oem_codes),
      articleCodes: parseCodes(r.article_codes),
    }),
    title: r.title,
    price: r.price,
    city: r.city,
    region: r.region,
    categorySlug: r.category_slug,
    companyName: r.company_name,
    sellerName: r.seller_name,
    brand: r.brand,
    oemCodes: parseCodes(r.oem_codes),
    articleCodes: parseCodes(r.article_codes),
    sourceName: r.source_name as CatalogSourceOffer["sourceName"],
    sourceUrl: r.source_url,
    shortSnippet: r.short_snippet,
    coverImageUrl,
    confidenceScore: r.confidence_score,
    haliwaliCompanyId: r.haliwali_company_id,
    titleSearch: r.title_search,
    brandSearch: r.brand_search,
    oemSearch: r.oem_search,
    companySearch: r.company_search,
    citySearch: r.city_search,
    importedAt: r.imported_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

const DRAFT_COLS = SOURCE_OFFER_DRAFT_SELECT_COLS;

export async function pgListSourceOfferDrafts(
  status?: CatalogSourceOfferDraftStatus,
): Promise<CatalogSourceOfferDraft[]> {
  const pool = getPool();
  let sql = `SELECT ${DRAFT_COLS} FROM catalog_source_offer_import_drafts`;
  const params: string[] = [];
  if (status) {
    sql += ` WHERE status = ANY($1::text[])`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 500`;
  const { rows } = await pool.query<DraftRow>(
    sql,
    status ? [sourceOfferDraftStatusDbValues(status)] : [],
  );
  return rows.map(rowToDraft);
}

export async function pgUpsertSourceOfferDrafts(
  items: {
    input: CatalogSourceOfferInput;
    duplicateHint: string | null;
    duplicateOfOfferId: number | null;
    existingDraftId?: number;
  }[],
): Promise<{ drafts: CatalogSourceOfferDraft[]; createdIds: number[]; updatedIds: number[] }> {
  const pool = getPool();
  const createdIds: number[] = [];
  const updatedIds: number[] = [];
  const drafts: CatalogSourceOfferDraft[] = [];

  for (const item of items) {
    const input = sanitizeSourceOfferInput(item.input);
    if (!input) continue;

    const search = buildSourceOfferSearchFields(input);
    const status = item.duplicateHint || item.duplicateOfOfferId ? "duplicate" : "draft";

    if (item.existingDraftId) {
      const { rows } = await pool.query<DraftRow>(
        `
        UPDATE catalog_source_offer_import_drafts SET
          status = $2, offer_type = $3, title = $4, price = $5, city = $6, region = $7, category_slug = $8,
          company_name = $9, seller_name = $10, brand = $11,
          oem_codes = $12::jsonb, article_codes = $13::jsonb,
          source_name = $14, source_url = $15, short_snippet = $16, cover_image_url = $17, confidence_score = $18,
          duplicate_hint = $19, duplicate_of_offer_id = $20,
          title_search = $21, brand_search = $22, oem_search = $23, company_search = $24, city_search = $25,
          raw_payload = $26::jsonb, imported_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING ${DRAFT_COLS}
        `,
        [
          item.existingDraftId,
          status,
          input.offerType,
          input.title,
          input.price,
          input.city,
          input.region,
          input.categorySlug,
          input.companyName,
          input.sellerName,
          input.brand,
          JSON.stringify(input.oemCodes),
          JSON.stringify(input.articleCodes),
          input.sourceName,
          input.sourceUrl,
          input.shortSnippet,
          input.coverImageUrl,
          input.confidenceScore,
          item.duplicateHint,
          item.duplicateOfOfferId,
          search.titleSearch,
          search.brandSearch,
          search.oemSearch,
          search.companySearch,
          search.citySearch,
          JSON.stringify(rawPayloadForDb(input.rawPayload, input.coverImageUrl)),
        ],
      );
      if (rows[0]) {
        updatedIds.push(rows[0].id);
        drafts.push(rowToDraft(rows[0]));
      }
      continue;
    }

    const { rows } = await pool.query<DraftRow>(
      `
      INSERT INTO catalog_source_offer_import_drafts (
        status, offer_type, title, price, city, region, category_slug, company_name, seller_name, brand,
        oem_codes, article_codes, source_name, source_url, short_snippet, cover_image_url, confidence_score,
        duplicate_hint, duplicate_of_offer_id,
        title_search, brand_search, oem_search, company_search, city_search, raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25::jsonb
      )
      RETURNING ${DRAFT_COLS}
      `,
      [
        status,
        input.offerType,
        input.title,
        input.price,
        input.city,
        input.region,
        input.categorySlug,
        input.companyName,
        input.sellerName,
        input.brand,
        JSON.stringify(input.oemCodes),
        JSON.stringify(input.articleCodes),
        input.sourceName,
        input.sourceUrl,
        input.shortSnippet,
        input.coverImageUrl,
        input.confidenceScore,
        item.duplicateHint,
        item.duplicateOfOfferId,
        search.titleSearch,
        search.brandSearch,
        search.oemSearch,
        search.companySearch,
        search.citySearch,
        JSON.stringify(rawPayloadForDb(input.rawPayload, input.coverImageUrl)),
      ],
    );
    if (rows[0]) {
      createdIds.push(rows[0].id);
      drafts.push(rowToDraft(rows[0]));
    }
  }

  return { drafts, createdIds, updatedIds };
}

export async function pgSetSourceOfferDraftStatuses(
  ids: number[],
  status: CatalogSourceOfferDraftStatus,
): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE catalog_source_offer_import_drafts SET status = $1, updated_at = NOW() WHERE id = ANY($2::int[])`,
    [status, ids],
  );
  return rowCount ?? 0;
}

export async function pgPublishSourceOfferDrafts(ids: number[]): Promise<CatalogSourceOfferDraft[]> {
  const pool = getPool();
  const out: CatalogSourceOfferDraft[] = [];

  for (const id of ids) {
    const { rows: draftRows } = await pool.query<DraftRow>(
      `SELECT ${DRAFT_COLS} FROM catalog_source_offer_import_drafts WHERE id = $1`,
      [id],
    );
    const d = draftRows[0];
    if (!d || normalizeSourceOfferDraftStatus(d.status) !== "approved") continue;

    const publishCheck = validateSourceOfferInput(draftRowToInput(d));
    if (!publishCheck.ok) {
      const rejected = await pgRejectDraftWithReason(pool, id, publishCheck.reason);
      if (rejected) out.push(rejected);
      continue;
    }

    const sanitized = sanitizeSourceOfferInput(publishCheck.input);
    if (!sanitized) {
      const rejected = await pgRejectDraftWithReason(pool, id, "missing_required_fields");
      if (rejected) out.push(rejected);
      continue;
    }

    const offerType = resolveOfferTypeForStorage(sanitized);
    const cover = resolveCoverImageUrl({
      coverImageUrl: sanitized.coverImageUrl,
      rawPayload: sanitized.rawPayload,
    });
    const search = buildSourceOfferSearchFields(sanitized);

    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM catalog_source_offers WHERE lower(trim(source_url)) = lower(trim($1)) LIMIT 1`,
      [sanitized.sourceUrl],
    );
    if (existing[0]) {
      const { rows: updated } = await pool.query<DraftRow>(
        `
        UPDATE catalog_source_offer_import_drafts SET
          status = 'duplicate', duplicate_of_offer_id = $2, published_offer_id = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${DRAFT_COLS}
        `,
        [id, existing[0].id],
      );
      if (updated[0]) out.push(rowToDraft(updated[0]));
      continue;
    }

    const insertParams = [
      d.id,
      offerType,
      sanitized.title,
      sanitized.price,
      sanitized.city,
      sanitized.region,
      sanitized.categorySlug,
      sanitized.companyName,
      sanitized.sellerName,
      sanitized.brand,
      JSON.stringify(sanitized.oemCodes),
      JSON.stringify(sanitized.articleCodes),
      sanitized.sourceName,
      sanitized.sourceUrl,
      sanitized.shortSnippet,
      cover,
      sanitized.confidenceScore,
      search.titleSearch,
      search.brandSearch,
      search.oemSearch,
      search.companySearch,
      search.citySearch,
    ];

    let offerId: number | undefined;
    try {
      const { rows: ins } = await pool.query<{ id: number }>(
        `
        INSERT INTO catalog_source_offers (
          draft_id, offer_type, title, price, city, region, category_slug, company_name, seller_name, brand,
          oem_codes, article_codes, source_name, source_url, short_snippet, cover_image_url, confidence_score,
          title_search, brand_search, oem_search, company_search, city_search
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22
        )
        RETURNING id
        `,
        insertParams,
      );
      offerId = ins[0]?.id;
    } catch (insertErr) {
      if (!isMissingColumnDbError(insertErr)) throw insertErr;
      const legacyParams = [
        d.id,
        sanitized.title,
        sanitized.price,
        sanitized.city,
        sanitized.region,
        sanitized.categorySlug,
        sanitized.companyName,
        sanitized.sellerName,
        sanitized.brand,
        JSON.stringify(sanitized.oemCodes),
        JSON.stringify(sanitized.articleCodes),
        sanitized.sourceName,
        sanitized.sourceUrl,
        sanitized.shortSnippet,
        sanitized.confidenceScore,
        search.titleSearch,
        search.brandSearch,
        search.oemSearch,
        search.companySearch,
        search.citySearch,
      ];
      const { rows: ins } = await pool.query<{ id: number }>(
        `
        INSERT INTO catalog_source_offers (
          draft_id, title, price, city, region, category_slug, company_name, seller_name, brand,
          oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
          title_search, brand_search, oem_search, company_search, city_search
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16,
          $17, $18, $19, $20, $21
        )
        RETURNING id
        `,
        legacyParams,
      );
      offerId = ins[0]?.id;
    }

    if (!offerId) continue;

    const { rows: published } = await pool.query<DraftRow>(
      `
      UPDATE catalog_source_offer_import_drafts SET
        status = 'published', published_offer_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING ${DRAFT_COLS}
      `,
      [id, offerId],
    );
    if (published[0]) out.push(rowToDraft(published[0]));
  }

  return out;
}

function buildPublishedOfferWhere(
  opts: CatalogSourceOfferListQuery | undefined,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (opts?.city) {
    params.push(`%${opts.city.trim().toLowerCase()}%`);
    clauses.push(`(city_search LIKE $${params.length} OR lower(city) LIKE $${params.length})`);
  }
  if (opts?.sourceName) {
    params.push(opts.sourceName);
    clauses.push(`source_name = $${params.length}`);
  }
  if (opts?.offerType) {
    clauses.push(sqlEffectiveOfferTypeMatch(opts.offerType));
  }
  if (opts?.brand?.trim()) {
    params.push(`%${opts.brand.trim().toLowerCase()}%`);
    const i = params.length;
    clauses.push(`(brand_search LIKE $${i} OR lower(COALESCE(brand, '')) LIKE $${i})`);
  }
  if (opts?.oemArticle?.trim()) {
    params.push(`%${opts.oemArticle.trim().toLowerCase()}%`);
    const i = params.length;
    clauses.push(
      `(oem_search LIKE $${i} OR oem_codes::text ILIKE $${i} OR article_codes::text ILIKE $${i} OR lower(short_snippet) LIKE $${i} OR title_search LIKE $${i})`,
    );
  }
  if (opts?.q && opts.q.trim().length >= 2) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    const i = params.length;
    clauses.push(
      `(title_search LIKE $${i} OR company_search LIKE $${i} OR oem_search LIKE $${i} OR brand_search LIKE $${i}
        OR city_search LIKE $${i}
        OR lower(short_snippet) LIKE $${i} OR lower(source_name) LIKE $${i}
        OR lower(COALESCE(brand, '')) LIKE $${i}
        OR oem_codes::text ILIKE $${i} OR article_codes::text ILIKE $${i})`,
    );
  }
  const priceExpr = `NULLIF(regexp_replace(COALESCE(price, ''), '[^0-9]', '', 'g'), '')::numeric`;
  if (opts?.priceMin != null) {
    params.push(opts.priceMin);
    clauses.push(`(${priceExpr} IS NOT NULL AND ${priceExpr} >= $${params.length})`);
  }
  if (opts?.priceMax != null) {
    params.push(opts.priceMax);
    clauses.push(`(${priceExpr} IS NOT NULL AND ${priceExpr} <= $${params.length})`);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function mapPublicPublishedRows(rows: OfferRow[]): CatalogSourceOffer[] {
  return rows
    .map(rowToOffer)
    .filter((o) => isPublicListableSourceOffer({ title: o.title, sourceUrl: o.sourceUrl }));
}

export async function pgListPublishedSourceOffers(
  opts?: CatalogSourceOfferListQuery,
): Promise<CatalogSourceOfferListResult> {
  const pool = getPool();
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const params: unknown[] = [];
  const where = buildPublishedOfferWhere(opts, params);

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM catalog_source_offers ${where}`,
    params,
  );
  const dbTotal = Number(countRes.rows[0]?.count ?? 0);

  const rows = await queryPublishedOfferRows(pool, where, params, limit, offset);
  const offers = mapPublicPublishedRows(rows);
  return { offers, total: dbTotal };
}

export type SourceOfferSyncDebug = {
  publishedOffersCountFromDb: number;
  publicApiCount: number;
  draftsApprovedCount: number;
  draftsPublishedCount: number;
  tableUsedByAdmin: string;
  tableUsedByPublicApi: string;
  listQueryError?: string;
};

export async function pgGetSourceOfferSyncDebug(): Promise<SourceOfferSyncDebug> {
  const table = CATALOG_SOURCE_OFFERS_TABLE;
  const publishedOffersCountFromDb = await pgCountPublishedSourceOffers();
  const draftsApprovedCount = await pgCountDraftsByStatus("approved");
  const draftsPublishedCount = await pgCountDraftsByStatus("published");

  let publicApiCount = 0;
  let listQueryError: string | undefined;
  try {
    const listed = await pgListPublishedSourceOffers({ limit: 500, offset: 0 });
    publicApiCount = listed.total;
  } catch (err) {
    listQueryError = err instanceof Error ? err.message : String(err);
  }

  return {
    publishedOffersCountFromDb,
    publicApiCount,
    draftsApprovedCount,
    draftsPublishedCount,
    tableUsedByAdmin: table,
    tableUsedByPublicApi: table,
    listQueryError,
  };
}

async function pgCountDraftsByStatus(status: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM catalog_source_offer_import_drafts WHERE status = $1`,
    [status],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function pgLoadSourceOfferDedupSeed(): Promise<{
  published: {
    id: number;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
  }[];
  drafts: {
    id: number;
    status: string;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
    publishedOfferId: number | null;
  }[];
}> {
  const pool = getPool();
  const { rows: offers } = await pool.query<{
    id: number;
    source_url: string;
    title: string;
    company_name: string;
    seller_name: string;
    city: string;
    oem_codes: string[];
    article_codes: string[];
  }>(
    `SELECT id, source_url, title, company_name, seller_name, city, oem_codes, article_codes FROM catalog_source_offers`,
  );
  const { rows: drafts } = await pool.query<{
    id: number;
    status: string;
    source_url: string;
    title: string;
    company_name: string;
    seller_name: string;
    city: string;
    oem_codes: string[];
    article_codes: string[];
    published_offer_id: number | null;
  }>(
    `SELECT id, status, source_url, title, company_name, seller_name, city, oem_codes, article_codes, published_offer_id
     FROM catalog_source_offer_import_drafts`,
  );
  return {
    published: offers.map((o) => ({
      id: o.id,
      sourceUrl: o.source_url,
      title: o.title,
      companyName: o.company_name,
      sellerName: o.seller_name,
      city: o.city,
      oemCodes: parseCodes(o.oem_codes),
      articleCodes: parseCodes(o.article_codes),
    })),
    drafts: drafts.map((d) => ({
      id: d.id,
      status: d.status,
      sourceUrl: d.source_url,
      title: d.title,
      companyName: d.company_name,
      sellerName: d.seller_name,
      city: d.city,
      oemCodes: parseCodes(d.oem_codes),
      articleCodes: parseCodes(d.article_codes),
      publishedOfferId: d.published_offer_id,
    })),
  };
}

const ACTIONABLE_DRAFT_STATUSES = ["draft", "new", "saved", "approved", "duplicate"];

export async function pgCheckSourceOffersTablesReady(): Promise<boolean> {
  const schema = await pgCheckSourceOfferSchemaReady();
  return schema.ready;
}

const REQUIRED_SOURCE_OFFER_COLUMNS = ["offer_type", "cover_image_url", "price"] as const;

export type SourceOfferSchemaReady = {
  ready: boolean;
  tablesExist: boolean;
  missing: string[];
};

/** Tables exist and columns required by app inserts are present. */
export async function pgCheckSourceOfferSchemaReady(): Promise<SourceOfferSchemaReady> {
  try {
    const intro = await pgIntrospectSourceOfferDb();
    const missing: string[] = [];
    if (!intro.catalog_source_offers.exists) {
      missing.push("table catalog_source_offers");
    } else {
      for (const col of REQUIRED_SOURCE_OFFER_COLUMNS) {
        if (!intro.catalog_source_offers.columns.includes(col)) {
          missing.push(`catalog_source_offers.${col}`);
        }
      }
    }
    if (!intro.catalog_source_offer_import_drafts.exists) {
      missing.push("table catalog_source_offer_import_drafts");
    } else {
      for (const col of REQUIRED_SOURCE_OFFER_COLUMNS) {
        if (!intro.catalog_source_offer_import_drafts.columns.includes(col)) {
          missing.push(`catalog_source_offer_import_drafts.${col}`);
        }
      }
    }
    return {
      ready: missing.length === 0,
      tablesExist:
        intro.catalog_source_offers.exists && intro.catalog_source_offer_import_drafts.exists,
      missing,
    };
  } catch {
    return { ready: false, tablesExist: false, missing: ["schema_check_failed"] };
  }
}

export type SourceOfferDbIntrospection = {
  catalog_source_offers: { exists: boolean; columns: string[] };
  catalog_source_offer_import_drafts: { exists: boolean; columns: string[] };
  image_url_column_present: {
    offers: boolean;
    drafts: boolean;
  };
};

export async function pgIntrospectSourceOfferDb(): Promise<SourceOfferDbIntrospection> {
  const pool = getPool();
  const tableNames = [CATALOG_SOURCE_OFFERS_TABLE, CATALOG_SOURCE_OFFER_DRAFTS_TABLE] as const;

  const { rows: tableRows } = await pool.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `,
    [tableNames],
  );
  const existing = new Set(tableRows.map((r) => r.table_name));

  const { rows: colRows } = await pool.query<{ table_name: string; column_name: string }>(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
    `,
    [tableNames],
  );

  const colsByTable: Record<string, string[]> = {
    [CATALOG_SOURCE_OFFERS_TABLE]: [],
    [CATALOG_SOURCE_OFFER_DRAFTS_TABLE]: [],
  };
  for (const r of colRows) {
    const list = colsByTable[r.table_name];
    if (list) list.push(r.column_name);
  }

  const offersCols = colsByTable[CATALOG_SOURCE_OFFERS_TABLE] ?? [];
  const draftsCols = colsByTable[CATALOG_SOURCE_OFFER_DRAFTS_TABLE] ?? [];

  return {
    catalog_source_offers: {
      exists: existing.has(CATALOG_SOURCE_OFFERS_TABLE),
      columns: offersCols,
    },
    catalog_source_offer_import_drafts: {
      exists: existing.has(CATALOG_SOURCE_OFFER_DRAFTS_TABLE),
      columns: draftsCols,
    },
    image_url_column_present: {
      offers: offersCols.includes("image_url"),
      drafts: draftsCols.includes("image_url"),
    },
  };
}

export async function pgCountPublishedSourceOffers(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM catalog_source_offers`);
  return Number(rows[0]?.count ?? 0);
}

export async function pgCountActionableSourceOfferDrafts(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM catalog_source_offer_import_drafts WHERE status = ANY($1::text[])`,
    [ACTIONABLE_DRAFT_STATUSES],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function pgDeletePublishedSourceOffers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getPool();
  const { rowCount } = await pool.query(`DELETE FROM catalog_source_offers WHERE id = ANY($1::int[])`, [ids]);
  return rowCount ?? 0;
}

const CANDIDATE_DRAFT_STATUSES = ["draft", "new", "saved", "approved"];

export async function pgCountSourceOfferDraftQueues(): Promise<{
  candidates: number;
  rejected: number;
  duplicate: number;
}> {
  const pool = getPool();
  const { rows } = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM catalog_source_offer_import_drafts GROUP BY status`,
  );
  let candidates = 0;
  let rejected = 0;
  let duplicate = 0;
  for (const row of rows) {
    const n = Number(row.count ?? 0);
    const s = row.status.trim().toLowerCase();
    if (CANDIDATE_DRAFT_STATUSES.includes(s)) candidates += n;
    else if (s === "rejected") rejected += n;
    else if (s === "duplicate") duplicate += n;
  }
  return { candidates, rejected, duplicate };
}
