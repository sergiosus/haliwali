import { logAdminCatalog } from "./catalogCatalogLog";
import { usesPostgres } from "./pgPool";
import type {
  CatalogImportCandidateHistoryItem,
  CatalogImportCandidateSession,
  PersistedImportCandidate,
} from "./catalogImportCandidateTypes";
import * as pg from "./serverCatalogImportCandidatesPg";
import * as json from "./serverCatalogImportCandidatesJson";

async function withPg<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return fallback();
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logAdminCatalog("pg_store_error", { error: msg.slice(0, 300) });
    throw e;
  }
}

export async function saveImportCandidateSession(input: {
  query: string;
  city: string;
  categorySlug: string;
  queriesUsed: string[];
  candidates: PersistedImportCandidate[];
}): Promise<CatalogImportCandidateSession> {
  const session = await withPg(
    () => pg.pgSaveImportCandidateSession(input),
    () => json.jsonSaveImportCandidateSession(input),
  );
  logAdminCatalog("import draft saved", {
    sessionId: session.id,
    candidates: session.candidates.length,
    query: session.query.slice(0, 80),
  });
  return session;
}

export async function getImportCandidateSession(id: number): Promise<CatalogImportCandidateSession | null> {
  return withPg(
    () => pg.pgGetImportCandidateSession(id),
    () => json.jsonGetImportCandidateSession(id),
  );
}

export async function getLatestImportCandidateSession(): Promise<CatalogImportCandidateSession | null> {
  return withPg(
    () => pg.pgGetLatestImportCandidateSession(),
    () => json.jsonGetLatestImportCandidateSession(),
  );
}

export async function updateImportCandidateSession(
  id: number,
  candidates: PersistedImportCandidate[],
): Promise<CatalogImportCandidateSession | null> {
  const session = await withPg(
    () => pg.pgUpdateImportCandidateSession(id, candidates),
    () => json.jsonUpdateImportCandidateSession(id, candidates),
  );
  if (session) {
    logAdminCatalog("import draft saved", { sessionId: session.id, candidates: session.candidates.length });
  }
  return session;
}

export async function listImportCandidateHistory(
  limit = 10,
): Promise<CatalogImportCandidateHistoryItem[]> {
  return withPg(
    () => pg.pgListImportCandidateHistory(limit),
    () => json.jsonListImportCandidateHistory(limit),
  );
}

export function markCandidatesImported(
  candidates: PersistedImportCandidate[],
  urls: string[],
  draftIdsByUrl: Map<string, number>,
): PersistedImportCandidate[] {
  const urlSet = new Set(urls.map((u) => u.trim()));
  return candidates.map((c) => {
    if (!urlSet.has(c.url.trim())) return c;
    return {
      ...c,
      state: "imported" as const,
      draftId: draftIdsByUrl.get(c.url.trim()) ?? c.draftId ?? null,
    };
  });
}
