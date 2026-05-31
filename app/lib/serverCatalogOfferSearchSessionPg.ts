import { getPool } from "./pgPool";
import type { OfferSearchSessionPayload, PersistedOfferSearchSession } from "./catalogOfferSearchSessionTypes";

const SCOPE = "latest";

type Row = {
  id: number;
  scope: string;
  payload: OfferSearchSessionPayload;
  created_at: Date;
  updated_at: Date;
};

function rowToSession(r: Row): PersistedOfferSearchSession {
  const p = r.payload ?? ({} as OfferSearchSessionPayload);
  return {
    id: r.id,
    query: p.query ?? "",
    city: p.city ?? "",
    brand: p.brand ?? "",
    oemArticle: p.oemArticle ?? "",
    sourceFilter: p.sourceFilter ?? "all",
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    results: Array.isArray(p.results) ? p.results : [],
    skipped: Array.isArray(p.skipped) ? p.skipped : [],
    message: p.message,
    emptyReason: p.emptyReason ?? null,
    stats: p.stats ?? {
      linksExtracted: 0,
      pagesScanned: 0,
      afterCityFilter: 0,
      afterPriceFilter: 0,
      afterBrandOemFilter: 0,
      afterDuplicateFilter: 0,
      sourceCounts: {},
      hidden: {},
      diagnostics: [],
      directSearchUrls: {},
      pagesPerSource: 3,
    },
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function pgSaveOfferSearchSession(
  payload: OfferSearchSessionPayload,
): Promise<PersistedOfferSearchSession> {
  const pool = getPool();
  const { rows } = await pool.query<Row>(
    `
    INSERT INTO catalog_offer_search_sessions (scope, payload)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (scope) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING *
    `,
    [SCOPE, JSON.stringify(payload)],
  );
  return rowToSession(rows[0]!);
}

export async function pgGetLatestOfferSearchSession(): Promise<PersistedOfferSearchSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<Row>(
    `SELECT * FROM catalog_offer_search_sessions WHERE scope = $1 LIMIT 1`,
    [SCOPE],
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function pgClearOfferSearchSession(): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM catalog_offer_search_sessions WHERE scope = $1`, [SCOPE]);
}
