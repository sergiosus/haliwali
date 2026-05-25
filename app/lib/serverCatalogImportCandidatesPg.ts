import { getPool } from "./pgPool";
import type {
  CatalogImportCandidateHistoryItem,
  CatalogImportCandidateSession,
  PersistedImportCandidate,
} from "./catalogImportCandidateTypes";

const HISTORY_LIMIT = 10;

type SessionRow = {
  id: number;
  query: string;
  city: string;
  category_slug: string;
  queries_used: string[] | null;
  candidates: PersistedImportCandidate[] | null;
  created_at: Date;
  updated_at: Date;
};

function rowToSession(r: SessionRow): CatalogImportCandidateSession {
  return {
    id: r.id,
    query: r.query ?? "",
    city: r.city ?? "",
    categorySlug: r.category_slug ?? "",
    queriesUsed: Array.isArray(r.queries_used) ? r.queries_used : [],
    candidates: Array.isArray(r.candidates) ? r.candidates : [],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

async function trimHistoryBeyondLimit(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    DELETE FROM catalog_import_candidate_sessions
    WHERE id NOT IN (
      SELECT id FROM catalog_import_candidate_sessions
      ORDER BY created_at DESC
      LIMIT $1
    )
  `, [HISTORY_LIMIT]);
}

export async function pgSaveImportCandidateSession(input: {
  query: string;
  city: string;
  categorySlug: string;
  queriesUsed: string[];
  candidates: PersistedImportCandidate[];
}): Promise<CatalogImportCandidateSession> {
  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `
    INSERT INTO catalog_import_candidate_sessions (query, city, category_slug, queries_used, candidates)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
    RETURNING *
    `,
    [
      input.query.slice(0, 2000),
      input.city.slice(0, 200),
      input.categorySlug.slice(0, 80),
      JSON.stringify(input.queriesUsed),
      JSON.stringify(input.candidates),
    ],
  );
  await trimHistoryBeyondLimit();
  return rowToSession(rows[0]!);
}

export async function pgGetImportCandidateSession(id: number): Promise<CatalogImportCandidateSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM catalog_import_candidate_sessions WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function pgGetLatestImportCandidateSession(): Promise<CatalogImportCandidateSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM catalog_import_candidate_sessions ORDER BY updated_at DESC LIMIT 1`,
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function pgUpdateImportCandidateSession(
  id: number,
  candidates: PersistedImportCandidate[],
): Promise<CatalogImportCandidateSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<SessionRow>(
    `
    UPDATE catalog_import_candidate_sessions
    SET candidates = $2::jsonb, updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id, JSON.stringify(candidates)],
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function pgListImportCandidateHistory(
  limit = HISTORY_LIMIT,
): Promise<CatalogImportCandidateHistoryItem[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    query: string;
    city: string;
    category_slug: string;
    candidates: PersistedImportCandidate[] | null;
    created_at: Date;
  }>(
    `
    SELECT id, query, city, category_slug, candidates, created_at
    FROM catalog_import_candidate_sessions
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    query: r.query ?? "",
    city: r.city ?? "",
    categorySlug: r.category_slug ?? "",
    candidateCount: Array.isArray(r.candidates) ? r.candidates.length : 0,
    createdAt: r.created_at.toISOString(),
  }));
}
