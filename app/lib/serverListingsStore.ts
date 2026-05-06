import { usesPostgres } from "./pgPool";
import type { Listing, ListingStatus } from "./listingModel";
import { isListingPubliclyListed, normalizeListingLifecycle } from "./listingModel";
import * as pg from "./serverListingsPg";
import * as json from "./serverListingsJson";
import { normalizeListingId } from "./listingId";
import { purgeListingReportsNotInValidIdSet, removeReportsTargetingListingIds } from "./serverTrustStore";

export { normalizeListingId } from "./listingId";

export function isPublicModerationStatus(status: string): boolean {
  return status === "auto" || status === "approved" || status === "published";
}

/** Strip sensitive fields for non-owners (defense in depth; API uses this for mixed bootstrap). */
export function listingForPublicViewer(listing: Listing): Listing {
  const raw = JSON.parse(JSON.stringify(listing)) as Listing;
  delete (raw as { phone?: string }).phone;
  delete (raw as { editToken?: string }).editToken;
  if (!raw.addressPublic) {
    delete raw.address;
    delete raw.latitude;
    delete raw.longitude;
    delete raw.location;
  }
  return raw;
}

export async function listBootstrap(userId: string | null, isAdmin: boolean): Promise<Listing[]> {
  if (usesPostgres()) {
    await pg.pgRunExpiredSoftDeleteCleanup();
    return pg.pgListBootstrap(userId, isAdmin);
  }
  await json.jsonRunExpiredSoftDeleteCleanup();
  return json.jsonListBootstrap(userId, isAdmin);
}

/** Listings for client bootstrap: full rows for own + admin; stripped for everyone else. */
export async function listBootstrapForClient(userId: string | null, isAdmin: boolean): Promise<Listing[]> {
  const rows = await listBootstrap(userId, isAdmin);
  if (isAdmin) return rows;
  const uid = userId?.trim() ?? "";
  return rows.map((l) => {
    if (uid && (l.ownerId ?? "").trim() === uid) return l;
    return listingForPublicViewer(l);
  });
}

export async function getListingById(id: string): Promise<Listing | null> {
  const clean = normalizeListingId(id);
  return usesPostgres() ? pg.pgGetById(clean) : json.jsonGetById(clean);
}

export async function getListingForViewer(id: string, userId: string | null, isAdmin: boolean): Promise<Listing | null> {
  const l = await getListingById(id);
  if (!l) return null;
  if (isAdmin) return l;
  const uid = userId?.trim() ?? "";
  if (uid && (l.ownerId ?? "").trim() === uid) return l;
  if (!isListingPubliclyListed(l)) return null;
  return listingForPublicViewer(l);
}

export async function insertListing(listing: Listing): Promise<void> {
  if (usesPostgres()) await pg.pgInsertListing(listing);
  else await json.jsonInsertListing(listing);
}

export async function replaceListing(listing: Listing): Promise<void> {
  if (usesPostgres()) await pg.pgReplaceListing(listing);
  else await json.jsonReplaceListing(listing);
}

export async function patchListingStatus(id: string, status: ListingStatus, moderationReason?: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  if (usesPostgres()) return pg.pgPatchListingStatus(clean, status, moderationReason);
  return json.jsonPatchListingStatus(clean, status, moderationReason);
}

export async function patchDealStatus(id: string, dealStatus: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  if (usesPostgres()) return pg.pgPatchDealStatus(clean, dealStatus);
  return json.jsonPatchDealStatus(clean, dealStatus);
}

/** User-facing delete: soft-delete row (complaints retain link until purge). */
export async function softDeleteListingById(id: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  const existing = await getListingById(clean);
  if (!existing) return false;
  if (usesPostgres()) return pg.pgSoftDeleteListing(existing);
  return json.jsonSoftDeleteListing(existing);
}

/** Physical remove + drop listing-target reports (admin / cleanup). */
export async function hardDeleteListingById(id: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  const ok = usesPostgres() ? await pg.pgDeleteListing(clean) : await json.jsonDeleteListing(clean);
  if (ok) await removeReportsTargetingListingIds([clean]);
  return ok;
}

export async function archiveListingFromTrash(id: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  if (usesPostgres()) return pg.pgArchiveListingFromTrash(clean);
  return json.jsonArchiveListingFromTrash(clean);
}

export async function permanentDeleteListingByUser(id: string): Promise<boolean> {
  const clean = normalizeListingId(id);
  const l = await getListingById(clean);
  if (!l) return false;
  if (normalizeListingLifecycle(l.listingLifecycle) !== "deleted") return false;
  return hardDeleteListingById(clean);
}

/** @deprecated name — use softDeleteListingById / hardDeleteListingById */
export async function deleteListingById(id: string): Promise<boolean> {
  return softDeleteListingById(id);
}

export async function deleteListingsByOwner(ownerId: string): Promise<void> {
  const oid = ownerId.trim();
  if (!oid) return;
  if (usesPostgres()) {
    const ids = await pg.pgListListingIdsByOwner(oid);
    await pg.pgDeleteListingsByOwner(oid);
    await removeReportsTargetingListingIds(ids);
  } else {
    const ids = await json.jsonCollectListingIdsByOwner(oid);
    await json.jsonDeleteListingsByOwner(oid);
    await removeReportsTargetingListingIds(ids);
  }
}

export async function deleteAllListings(): Promise<void> {
  if (usesPostgres()) await pg.pgDeleteAllListings();
  else await json.jsonDeleteAllListings();
  await purgeListingReportsNotInValidIdSet(new Set());
}

export async function categoryCounts(): Promise<Record<string, number>> {
  return usesPostgres() ? pg.pgCategoryCounts() : json.jsonCategoryCounts();
}

export async function countSellerActiveListings(ownerId: string): Promise<number> {
  return usesPostgres() ? pg.pgCountSellerActiveListings(ownerId) : json.jsonCountSellerActiveListings(ownerId);
}

export async function countListingsByOwner(ownerId: string): Promise<number> {
  return usesPostgres() ? pg.pgCountListingsByOwner(ownerId) : json.jsonCountListingsByOwner(ownerId);
}

/** Minimal chat/header preview (no phone / no exact address). */
export async function adPreviewById(id: string): Promise<Record<string, unknown> | null> {
  const clean = normalizeListingId(id);
  const l = await getListingById(clean);
  if (!l) return null;
  const pubAuthor = typeof l.authorPublicName === "string" && l.authorPublicName.trim() ? l.authorPublicName.trim() : undefined;
  const images =
    isListingPubliclyListed(l) && Array.isArray(l.photos) ? l.photos.slice(0, 5) : [];
  if (!isPublicModerationStatus(l.status)) {
    // Non-public ads: still allow participants to see title in chat if they have link — omit sensitive.
    return {
      id: l.id,
      title: l.title,
      price: "price" in l ? l.price : undefined,
      city: l.city,
      category: l.categoryName,
      categorySlug: l.categorySlug,
      status: l.status,
      images,
      ownerId: l.ownerId,
      dealStatus: l.dealStatus ?? "active",
      ...(pubAuthor ? { authorPublicName: pubAuthor } : {}),
    };
  }
  return {
    id: l.id,
    title: l.title,
    price: "price" in l ? l.price : undefined,
    city: l.city,
    category: l.categoryName,
    categorySlug: l.categorySlug,
    status: l.status,
    images,
    ownerId: l.ownerId,
    dealStatus: l.dealStatus ?? "active",
    ...(pubAuthor ? { authorPublicName: pubAuthor } : {}),
  };
}

export async function assertListingOwnerOrAdmin(
  id: string,
  userId: string | null,
  isAdmin: boolean,
): Promise<{ ok: true; listing: Listing } | { ok: false; status: 403 | 404 }> {
  if (isAdmin) {
    const listing = await getListingById(id);
    if (!listing) return { ok: false, status: 404 };
    return { ok: true, listing };
  }
  const uid = userId?.trim() ?? "";
  if (!uid) return { ok: false, status: 403 };
  const listing = await getListingById(id);
  if (!listing) return { ok: false, status: 404 };
  if ((listing.ownerId ?? "").trim() !== uid) return { ok: false, status: 403 };
  return { ok: true, listing };
}
