import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type {
  CatalogImportCandidateHistoryItem,
  CatalogImportCandidateSession,
  PersistedImportCandidate,
} from "./catalogImportCandidateTypes";

const STORE_PATH = ".data/catalog-import-candidate-sessions.json";
const HISTORY_LIMIT = 10;

type JsonStore = {
  nextId: number;
  sessions: CatalogImportCandidateSession[];
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogImportCandidatesJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    const parsed = JSON.parse(raw) as JsonStore;
    return { nextId: parsed.nextId ?? 1, sessions: parsed.sessions ?? [] };
  } catch {
    return { nextId: 1, sessions: [] };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogImportCandidatesJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  store.sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  store.sessions = store.sessions.slice(0, HISTORY_LIMIT);
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

export async function jsonSaveImportCandidateSession(input: {
  query: string;
  city: string;
  categorySlug: string;
  queriesUsed: string[];
  candidates: PersistedImportCandidate[];
}): Promise<CatalogImportCandidateSession> {
  const store = await readStore();
  const now = new Date().toISOString();
  const session: CatalogImportCandidateSession = {
    id: store.nextId++,
    query: input.query.slice(0, 2000),
    city: input.city.slice(0, 200),
    categorySlug: input.categorySlug.slice(0, 80),
    queriesUsed: input.queriesUsed,
    candidates: input.candidates,
    createdAt: now,
    updatedAt: now,
  };
  store.sessions.unshift(session);
  await writeStore(store);
  return session;
}

export async function jsonGetImportCandidateSession(
  id: number,
): Promise<CatalogImportCandidateSession | null> {
  const store = await readStore();
  return store.sessions.find((s) => s.id === id) ?? null;
}

export async function jsonGetLatestImportCandidateSession(): Promise<CatalogImportCandidateSession | null> {
  const store = await readStore();
  if (store.sessions.length === 0) return null;
  const sorted = [...store.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return sorted[0] ?? null;
}

export async function jsonUpdateImportCandidateSession(
  id: number,
  candidates: PersistedImportCandidate[],
): Promise<CatalogImportCandidateSession | null> {
  const store = await readStore();
  const idx = store.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const updated: CatalogImportCandidateSession = {
    ...store.sessions[idx]!,
    candidates,
    updatedAt: new Date().toISOString(),
  };
  store.sessions[idx] = updated;
  await writeStore(store);
  return updated;
}

export async function jsonListImportCandidateHistory(
  limit = HISTORY_LIMIT,
): Promise<CatalogImportCandidateHistoryItem[]> {
  const store = await readStore();
  return store.sessions.slice(0, limit).map((s) => ({
    id: s.id,
    query: s.query,
    city: s.city,
    categorySlug: s.categorySlug,
    candidateCount: s.candidates.length,
    createdAt: s.createdAt,
  }));
}
