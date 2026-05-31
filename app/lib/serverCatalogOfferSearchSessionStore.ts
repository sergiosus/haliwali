import { usesPostgres } from "./pgPool";
import type { OfferSearchSessionPayload, PersistedOfferSearchSession } from "./catalogOfferSearchSessionTypes";
import * as pg from "./serverCatalogOfferSearchSessionPg";
import * as json from "./serverCatalogOfferSearchSessionJson";

async function withStore<T>(pgFn: () => Promise<T>, jsonFn: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return jsonFn();
  try {
    return await pgFn();
  } catch {
    return jsonFn();
  }
}

export async function saveOfferSearchSession(
  payload: OfferSearchSessionPayload,
): Promise<PersistedOfferSearchSession> {
  return withStore(
    () => pg.pgSaveOfferSearchSession(payload),
    () => json.jsonSaveOfferSearchSession(payload),
  );
}

export async function getLatestOfferSearchSession(): Promise<PersistedOfferSearchSession | null> {
  return withStore(
    () => pg.pgGetLatestOfferSearchSession(),
    () => json.jsonGetLatestOfferSearchSession(),
  );
}

export async function clearOfferSearchSession(): Promise<void> {
  await withStore(
    () => pg.pgClearOfferSearchSession().then(() => undefined),
    () => json.jsonClearOfferSearchSession(),
  );
}
