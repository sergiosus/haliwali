import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type { CatalogImportSession } from "./catalogImportTypes";

const STORE_PATH = ".data/catalog-import-sessions.json";

type JsonStore = {
  nextId: number;
  sessions: CatalogImportSession[];
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogImportSessionJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    const parsed = JSON.parse(raw) as JsonStore;
    return { nextId: parsed.nextId ?? 1, sessions: parsed.sessions ?? [] };
  } catch {
    return { nextId: 1, sessions: [] };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogImportSessionJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

export async function jsonCreateImportSession(input: {
  query: string;
  city: string;
  categorySlug: string;
  resultCount: number;
}): Promise<CatalogImportSession> {
  const store = await readStore();
  const session: CatalogImportSession = {
    id: store.nextId++,
    query: input.query.slice(0, 2000),
    city: input.city.slice(0, 200),
    categorySlug: input.categorySlug.slice(0, 80),
    resultCount: input.resultCount,
    createdAt: new Date().toISOString(),
  };
  store.sessions.unshift(session);
  store.sessions = store.sessions.slice(0, 200);
  await writeStore(store);
  return session;
}

export async function jsonListImportSessions(limit = 30): Promise<CatalogImportSession[]> {
  const store = await readStore();
  return store.sessions.slice(0, limit);
}
