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
import { buildSourceOfferSearchFields } from "./catalogSourceOfferSearchFields";

type DraftRow = {
  id: number;
  status: string;
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

type OfferRow = Omit<DraftRow, "status" | "duplicate_hint" | "duplicate_of_offer_id" | "published_offer_id" | "raw_payload"> & {
  draft_id: number | null;
  haliwali_company_id: number | null;
};

function parseCodes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

function rowToDraft(r: DraftRow): CatalogSourceOfferDraft {
  return {
    id: r.id,
    status: normalizeSourceOfferDraftStatus(r.status),
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

function rowToOffer(r: OfferRow): CatalogSourceOffer {
  return {
    id: r.id,
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

const DRAFT_COLS = `id, status, title, price, city, region, category_slug, company_name, seller_name, brand,
  oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
  duplicate_hint, duplicate_of_offer_id, published_offer_id,
  title_search, brand_search, oem_search, company_search, city_search,
  raw_payload, imported_at, created_at, updated_at`;

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
    const search = buildSourceOfferSearchFields(item.input);
    const status = item.duplicateHint || item.duplicateOfOfferId ? "duplicate" : "draft";

    if (item.existingDraftId) {
      const { rows } = await pool.query<DraftRow>(
        `
        UPDATE catalog_source_offer_import_drafts SET
          status = $2, title = $3, price = $4, city = $5, region = $6, category_slug = $7,
          company_name = $8, seller_name = $9, brand = $10,
          oem_codes = $11::jsonb, article_codes = $12::jsonb,
          source_name = $13, source_url = $14, short_snippet = $15, confidence_score = $16,
          duplicate_hint = $17, duplicate_of_offer_id = $18,
          title_search = $19, brand_search = $20, oem_search = $21, company_search = $22, city_search = $23,
          raw_payload = $24::jsonb, imported_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING ${DRAFT_COLS}
        `,
        [
          item.existingDraftId,
          status,
          item.input.title,
          item.input.price,
          item.input.city,
          item.input.region,
          item.input.categorySlug,
          item.input.companyName,
          item.input.sellerName,
          item.input.brand,
          JSON.stringify(item.input.oemCodes),
          JSON.stringify(item.input.articleCodes),
          item.input.sourceName,
          item.input.sourceUrl,
          item.input.shortSnippet,
          item.input.confidenceScore,
          item.duplicateHint,
          item.duplicateOfOfferId,
          search.titleSearch,
          search.brandSearch,
          search.oemSearch,
          search.companySearch,
          search.citySearch,
          JSON.stringify(item.input.rawPayload ?? {}),
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
        status, title, price, city, region, category_slug, company_name, seller_name, brand,
        oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
        duplicate_hint, duplicate_of_offer_id,
        title_search, brand_search, oem_search, company_search, city_search, raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23::jsonb
      )
      RETURNING ${DRAFT_COLS}
      `,
      [
        status,
        item.input.title,
        item.input.price,
        item.input.city,
        item.input.region,
        item.input.categorySlug,
        item.input.companyName,
        item.input.sellerName,
        item.input.brand,
        JSON.stringify(item.input.oemCodes),
        JSON.stringify(item.input.articleCodes),
        item.input.sourceName,
        item.input.sourceUrl,
        item.input.shortSnippet,
        item.input.confidenceScore,
        item.duplicateHint,
        item.duplicateOfOfferId,
        search.titleSearch,
        search.brandSearch,
        search.oemSearch,
        search.companySearch,
        search.citySearch,
        JSON.stringify(item.input.rawPayload ?? {}),
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

    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM catalog_source_offers WHERE lower(trim(source_url)) = lower(trim($1)) LIMIT 1`,
      [d.source_url],
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

    const { rows: ins } = await pool.query<{ id: number }>(
      `
      INSERT INTO catalog_source_offers (
        draft_id, title, price, city, region, category_slug, company_name, seller_name, brand,
        oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
        title_search, brand_search, oem_search, company_search, city_search
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15,
        $16, $17, $18, $19, $20
      )
      RETURNING id
      `,
      [
        d.id,
        d.title,
        d.price,
        d.city,
        d.region,
        d.category_slug,
        d.company_name,
        d.seller_name,
        d.brand,
        JSON.stringify(parseCodes(d.oem_codes)),
        JSON.stringify(parseCodes(d.article_codes)),
        d.source_name,
        d.source_url,
        d.short_snippet,
        d.confidence_score,
        d.title_search,
        d.brand_search,
        d.oem_search,
        d.company_search,
        d.city_search,
      ],
    );
    const offerId = ins[0]?.id;
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

export async function pgListPublishedSourceOffers(opts?: {
  q?: string;
  categorySlug?: string;
  city?: string;
  limit?: number;
}): Promise<CatalogSourceOffer[]> {
  const pool = getPool();
  const limit = opts?.limit ?? 48;
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (opts?.categorySlug) {
    params.push(opts.categorySlug.trim().toLowerCase());
    clauses.push(`category_slug = $${params.length}`);
  }
  if (opts?.city) {
    params.push(`%${opts.city.trim().toLowerCase()}%`);
    clauses.push(`(city_search LIKE $${params.length} OR lower(city) LIKE $${params.length})`);
  }
  if (opts?.q && opts.q.trim().length >= 2) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    const i = params.length;
    clauses.push(
      `(title_search LIKE $${i} OR company_search LIKE $${i} OR oem_search LIKE $${i} OR brand_search LIKE $${i})`,
    );
  }
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query<OfferRow>(
    `
    SELECT id, draft_id, title, price, city, region, category_slug, company_name, seller_name, brand,
      oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
      haliwali_company_id, title_search, brand_search, oem_search, company_search, city_search,
      imported_at, created_at, updated_at
    FROM catalog_source_offers
    ${where}
    ORDER BY imported_at DESC
    LIMIT $${params.length}
    `,
    params,
  );
  return rows.map(rowToOffer);
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
