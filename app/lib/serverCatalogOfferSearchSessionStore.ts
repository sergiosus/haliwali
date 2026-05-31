import { logCatalogOfferSearch } from "./catalogCatalogLog";
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

/** Persist search session; never throws — search results must still return if DB/file store fails. */
export async function saveOfferSearchSession(
  payload: OfferSearchSessionPayload,
): Promise<PersistedOfferSearchSession | null> {
  try {
    return await withStore(
      () => pg.pgSaveOfferSearchSession(payload),
      () => json.jsonSaveOfferSearchSession(payload),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logCatalogOfferSearch("session_save_failed", { error: msg });
    return null;
  }
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
