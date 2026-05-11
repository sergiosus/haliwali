import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Listing, ListingStatus } from "./listingModel";
import {
  buildDeletedSnapshot,
  DELETED_DESCRIPTION_PREVIEW_MAX,
  isListingPubliclyListed,
  LISTING_SOFT_DELETE_RETENTION_MS,
  normalizeListingLifecycle,
} from "./listingModel";
import { normalizeListingId } from "./listingId";
import { listingFromPersistentRow, listingToPersistentRow } from "./serverListingsMap";
import { removeReportsTargetingListingIds } from "./serverTrustStore";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const DATA_DIR = path.join(process.cwd(), ".data");
export const LISTINGS_JSON_PATH = path.join(DATA_DIR, "listings.json");

type FileShape = {
  version: 1;
  byId: Record<string, Record<string, unknown>>;
};

async function readFileShape(): Promise<FileShape> {
  assertFileStoreNotUsedInProduction("serverListingsJson.readFileShape", { path: LISTINGS_JSON_PATH });
  try {
    const raw = await readFile(LISTINGS_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { version: 1, byId: {} };
    const o = parsed as Record<string, unknown>;
    const byId = o.byId;
    if (!byId || typeof byId !== "object") return { version: 1, byId: {} };
    return { version: 1, byId: byId as Record<string, Record<string, unknown>> };
  } catch {
    return { version: 1, byId: {} };
  }
}

async function writeFileShape(next: FileShape) {
  assertFileStoreNotUsedInProduction("serverListingsJson.writeFileShape", { path: LISTINGS_JSON_PATH });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LISTINGS_JSON_PATH, JSON.stringify(next, null, 2), "utf8");
}

function allListings(map: Record<string, Record<string, unknown>>): Listing[] {
  const out: Listing[] = [];
  for (const row of Object.values(map)) {
    const l = listingFromPersistentRow(row);
    if (l) out.push(l);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function isActiveDeal(ds: string): boolean {
  const s = ds.trim();
  if (!s) return true;
  return s === "active";
}

export async function jsonListBootstrap(userId: string | null, isAdmin: boolean): Promise<Listing[]> {
  const { byId } = await readFileShape();
  const all = allListings(byId);
  if (isAdmin) return all;
  if (userId?.trim()) {
    const uid = userId.trim();
    return all.filter(
      (l) =>
        (l.ownerId ?? "").trim() === uid ||
        (isListingPubliclyListed(l) && isActiveDeal((l.dealStatus ?? "active").trim())),
    );
  }
  return all.filter((l) => isListingPubliclyListed(l) && isActiveDeal((l.dealStatus ?? "active").trim()));
}

export async function jsonGetById(id: string): Promise<Listing | null> {
  const clean = id.trim();
  if (!clean) return null;
  const { byId } = await readFileShape();
  const row = byId[clean];
  if (!row) return null;
  return listingFromPersistentRow(row);
}

export async function jsonInsertListing(listing: Listing): Promise<void> {
  const { byId } = await readFileShape();
  byId[listing.id] = listingToPersistentRow(listing);
  await writeFileShape({ version: 1, byId });
}

export async function jsonReplaceListing(listing: Listing): Promise<void> {
  const { byId } = await readFileShape();
  byId[listing.id] = listingToPersistentRow(listing);
  await writeFileShape({ version: 1, byId });
}

export async function jsonPatchListingStatus(id: string, status: ListingStatus, moderationReason?: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const { byId } = await readFileShape();
  const row = byId[clean];
  if (!row) return false;
  row.status = status;
  row.moderation_reason = moderationReason ?? "";
  row.updated_at = Date.now();
  await writeFileShape({ version: 1, byId });
  return true;
}

export async function jsonPatchDealStatus(id: string, dealStatus: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const { byId } = await readFileShape();
  const row = byId[clean];
  if (!row) return false;
  row.deal_status = dealStatus;
  row.updated_at = Date.now();
  await writeFileShape({ version: 1, byId });
  return true;
}

export async function jsonDeleteListing(id: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const { byId } = await readFileShape();
  if (!byId[clean]) return false;
  delete byId[clean];
  await writeFileShape({ version: 1, byId });
  return true;
}

export async function jsonCollectListingIdsByOwner(ownerId: string): Promise<string[]> {
  const oid = ownerId.trim();
  if (!oid) return [];
  const { byId } = await readFileShape();
  const ids: string[] = [];
  for (const row of Object.values(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if ((l.ownerId ?? "").trim() === oid) ids.push(normalizeListingId(l.id));
  }
  return ids;
}

export async function jsonDeleteListingsByOwner(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { byId } = await readFileShape();
  let n = 0;
  for (const [id, row] of Object.entries(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if ((l.ownerId ?? "").trim() === oid) {
      delete byId[id];
      n += 1;
    }
  }
  await writeFileShape({ version: 1, byId });
  return n;
}

export async function jsonDeleteAllListings(): Promise<void> {
  await writeFileShape({ version: 1, byId: {} });
}

export async function jsonCategoryCounts(): Promise<Record<string, number>> {
  const { byId } = await readFileShape();
  const out: Record<string, number> = {};
  for (const row of Object.values(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if (!isListingPubliclyListed(l)) continue;
    if (!isActiveDeal((l.dealStatus ?? "active").trim())) continue;
    const slug = (l.categorySlug ?? "").trim();
    if (!slug) continue;
    out[slug] = (out[slug] ?? 0) + 1;
  }
  return out;
}

export async function jsonCountSellerActiveListings(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { byId } = await readFileShape();
  let n = 0;
  for (const row of Object.values(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if ((l.ownerId ?? "").trim() !== oid) continue;
    if (!isListingPubliclyListed(l)) continue;
    if (!isActiveDeal((l.dealStatus ?? "active").trim())) continue;
    n += 1;
  }
  return n;
}

export async function jsonListPublicListingsByOwner(ownerId: string): Promise<Listing[]> {
  const oid = ownerId.trim();
  if (!oid) return [];
  const { byId } = await readFileShape();
  const out: Listing[] = [];
  for (const row of Object.values(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if ((l.ownerId ?? "").trim() !== oid) continue;
    if (!isListingPubliclyListed(l)) continue;
    if (!isActiveDeal((l.dealStatus ?? "active").trim())) continue;
    out.push(l);
  }
  out.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  return out;
}

export async function jsonCountListingsByOwner(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { byId } = await readFileShape();
  let n = 0;
  for (const row of Object.values(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if ((l.ownerId ?? "").trim() !== oid) continue;
    n += 1;
  }
  return n;
}

export async function jsonRunExpiredSoftDeleteCleanup(): Promise<number> {
  const { byId } = await readFileShape();
  const now = Date.now();
  const idsToPurge: string[] = [];
  for (const [id, row] of Object.entries(byId)) {
    const l = listingFromPersistentRow(row);
    if (!l) continue;
    if (normalizeListingLifecycle(l.listingLifecycle) !== "deleted") continue;
    const deadline = typeof l.deletePermanentlyAt === "number" ? l.deletePermanentlyAt : 0;
    if (!deadline || deadline > now) continue;
    delete byId[id];
    idsToPurge.push(normalizeListingId(id));
  }
  if (idsToPurge.length === 0) return 0;
  await writeFileShape({ version: 1, byId });
  await removeReportsTargetingListingIds(idsToPurge);
  return idsToPurge.length;
}

export async function jsonSoftDeleteListing(listing: Listing): Promise<boolean> {
  if (normalizeListingLifecycle(listing.listingLifecycle) !== "live") return false;
  const now = Date.now();
  const snap = buildDeletedSnapshot(listing, DELETED_DESCRIPTION_PREVIEW_MAX);
  const next = {
    ...listing,
    listingLifecycle: "deleted" as const,
    deletedAt: now,
    deletePermanentlyAt: now + LISTING_SOFT_DELETE_RETENTION_MS,
    archivedAt: undefined,
    deletedSnapshot: snap,
    photos: [],
    description: snap.preview,
    updatedAt: now,
  } as Listing;
  await jsonReplaceListing(next);
  return true;
}

export async function jsonArchiveListingFromTrash(id: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const l = await jsonGetById(clean);
  if (!l || normalizeListingLifecycle(l.listingLifecycle) !== "deleted") return false;
  const now = Date.now();
  const next = {
    ...l,
    listingLifecycle: "archived" as const,
    archivedAt: now,
    deletePermanentlyAt: undefined,
    updatedAt: now,
  } as Listing;
  await jsonReplaceListing(next);
  return true;
}

export async function jsonUpsertMinimalRecords(
  records: Array<Record<string, unknown>>,
): Promise<{ upserted: string[] }> {
  const { byId } = await readFileShape();
  const upserted: string[] = [];
  for (const rec of records) {
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id) continue;
    const existing = byId[id];
    const merged: Record<string, unknown> = {
      ...(existing ?? {}),
      ...rec,
      id,
      edit_token: existing?.edit_token ?? rec.edit_token ?? rec.editToken ?? id,
      owner_id: rec.owner_id ?? rec.ownerId ?? existing?.owner_id ?? "",
    };
    byId[id] = merged;
    upserted.push(id);
  }
  if (upserted.length > 0) await writeFileShape({ version: 1, byId });
  return { upserted };
}
