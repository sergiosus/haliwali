import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type { OfferSearchSessionPayload, PersistedOfferSearchSession } from "./catalogOfferSearchSessionTypes";

const STORE_PATH = ".data/catalog-offer-search-session.json";

type JsonStore = {
  session: (OfferSearchSessionPayload & { id: number; createdAt: string; updatedAt: string }) | null;
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogOfferSearchSessionJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    return JSON.parse(raw) as JsonStore;
  } catch {
    return { session: null };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogOfferSearchSessionJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

export async function jsonSaveOfferSearchSession(
  payload: OfferSearchSessionPayload,
): Promise<PersistedOfferSearchSession> {
  const now = new Date().toISOString();
  const store = await readStore();
  const id = store.session?.id ?? 1;
  store.session = { id, ...payload, createdAt: store.session?.createdAt ?? now, updatedAt: now };
  await writeStore(store);
  return {
    id,
    ...payload,
    createdAt: store.session.createdAt,
    updatedAt: store.session.updatedAt,
  };
}

export async function jsonGetLatestOfferSearchSession(): Promise<PersistedOfferSearchSession | null> {
  const store = await readStore();
  if (!store.session) return null;
  const s = store.session;
  return {
    id: s.id,
    query: s.query,
    city: s.city,
    brand: s.brand,
    oemArticle: s.oemArticle,
    sourceFilter: s.sourceFilter,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    results: s.results,
    skipped: s.skipped,
    message: s.message,
    emptyReason: s.emptyReason,
    stats: s.stats,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export async function jsonClearOfferSearchSession(): Promise<void> {
  await writeStore({ session: null });
}
