import { getPool } from "./pgPool";
import type { Listing, ListingStatus } from "./listingModel";
import {
  buildDeletedSnapshot,
  DELETED_DESCRIPTION_PREVIEW_MAX,
  isListingPubliclyListed,
  LISTING_SOFT_DELETE_RETENTION_MS,
  normalizeListingLifecycle,
} from "./listingModel";
import { listingFromPersistentRow, listingToPersistentRow } from "./serverListingsMap";
import { removeReportsTargetingListingIds } from "./serverTrustStore";

export async function pgListBootstrap(userId: string | null, isAdmin: boolean): Promise<Listing[]> {
  const pool = getPool();
  if (isAdmin) {
    const { rows } = await pool.query(`SELECT * FROM listings ORDER BY created_at DESC`);
    return rows
      .map((r) => listingFromPersistentRow(r as unknown as Record<string, unknown>))
      .filter((x): x is Listing => Boolean(x));
  }
  if (userId?.trim()) {
    const { rows } = await pool.query(
      `SELECT * FROM listings
       WHERE owner_id = $1
          OR (
            status IN ('auto','approved')
            AND COALESCE(NULLIF(TRIM(deal_status), ''), 'active') = 'active'
            AND COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'live'
          )
       ORDER BY created_at DESC`,
      [userId.trim()],
    );
    return rows
      .map((r) => listingFromPersistentRow(r as unknown as Record<string, unknown>))
      .filter((x): x is Listing => Boolean(x));
  }
  const { rows } = await pool.query(
    `SELECT * FROM listings
     WHERE status IN ('auto','approved')
       AND COALESCE(NULLIF(TRIM(deal_status), ''), 'active') = 'active'
       AND COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'live'
     ORDER BY created_at DESC`,
  );
  return rows
    .map((r) => listingFromPersistentRow(r as unknown as Record<string, unknown>))
    .filter((x): x is Listing => Boolean(x));
}

export async function pgGetById(id: string): Promise<Listing | null> {
  const clean = id.trim();
  if (!clean) return null;
  const { rows } = await getPool().query(`SELECT * FROM listings WHERE id = $1`, [clean]);
  const row = rows[0];
  if (!row) return null;
  return listingFromPersistentRow(row as unknown as Record<string, unknown>);
}

export async function pgInsertListing(listing: Listing): Promise<void> {
  const r = listingToPersistentRow(listing);
  await getPool().query(
    `INSERT INTO listings (
      id, edit_token, owner_id, type, status, moderation_reason, deal_status,
      title, description, category_name, category_slug, city, address, latitude, longitude,
      address_public, specialization, price, phone, photos, created_at, updated_at, author_public_name,
      listing_lifecycle, deleted_at, delete_permanently_at, archived_at, deleted_snapshot
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,
      $24,$25,$26,$27,$28::jsonb
    )`,
    [
      r.id,
      r.edit_token,
      r.owner_id,
      r.type,
      r.status,
      r.moderation_reason,
      r.deal_status,
      r.title,
      r.description,
      r.category_name,
      r.category_slug,
      r.city,
      r.address,
      r.latitude,
      r.longitude,
      r.address_public,
      r.specialization,
      r.price,
      r.phone,
      JSON.stringify(r.photos ?? []),
      r.created_at,
      r.updated_at,
      typeof r.author_public_name === "string" ? r.author_public_name : "",
      typeof r.listing_lifecycle === "string" ? r.listing_lifecycle : "live",
      r.deleted_at ?? null,
      r.delete_permanently_at ?? null,
      r.archived_at ?? null,
      r.deleted_snapshot ? JSON.stringify(r.deleted_snapshot) : null,
    ],
  );
}

export async function pgReplaceListing(listing: Listing): Promise<void> {
  const r = listingToPersistentRow(listing);
  await getPool().query(
    `UPDATE listings SET
      edit_token = $2,
      owner_id = $3,
      type = $4,
      status = $5,
      moderation_reason = $6,
      deal_status = $7,
      title = $8,
      description = $9,
      category_name = $10,
      category_slug = $11,
      city = $12,
      address = $13,
      latitude = $14,
      longitude = $15,
      address_public = $16,
      specialization = $17,
      price = $18,
      phone = $19,
      photos = $20::jsonb,
      created_at = $21,
      updated_at = $22,
      author_public_name = $23,
      listing_lifecycle = $24,
      deleted_at = $25,
      delete_permanently_at = $26,
      archived_at = $27,
      deleted_snapshot = $28::jsonb
    WHERE id = $1`,
    [
      r.id,
      r.edit_token,
      r.owner_id,
      r.type,
      r.status,
      r.moderation_reason,
      r.deal_status,
      r.title,
      r.description,
      r.category_name,
      r.category_slug,
      r.city,
      r.address,
      r.latitude,
      r.longitude,
      r.address_public,
      r.specialization,
      r.price,
      r.phone,
      JSON.stringify(r.photos ?? []),
      r.created_at,
      r.updated_at,
      typeof r.author_public_name === "string" ? r.author_public_name : "",
      typeof r.listing_lifecycle === "string" ? r.listing_lifecycle : "live",
      r.deleted_at ?? null,
      r.delete_permanently_at ?? null,
      r.archived_at ?? null,
      r.deleted_snapshot ? JSON.stringify(r.deleted_snapshot) : null,
    ],
  );
}

export async function pgPatchListingStatus(id: string, status: ListingStatus, moderationReason?: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const reason = moderationReason ?? "";
  const { rowCount } = await getPool().query(
    `UPDATE listings SET status = $2, moderation_reason = $3, updated_at = $4 WHERE id = $1`,
    [clean, status, reason, Date.now()],
  );
  return (rowCount ?? 0) > 0;
}

export async function pgPatchDealStatus(id: string, dealStatus: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const { rowCount } = await getPool().query(`UPDATE listings SET deal_status = $2, updated_at = $3 WHERE id = $1`, [
    clean,
    dealStatus,
    Date.now(),
  ]);
  return (rowCount ?? 0) > 0;
}

export async function pgRunExpiredSoftDeleteCleanup(): Promise<number> {
  const now = Date.now();
  const { rows } = await getPool().query(
    `DELETE FROM listings
     WHERE COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'deleted'
       AND delete_permanently_at IS NOT NULL
       AND delete_permanently_at <= $1
     RETURNING id`,
    [now],
  );
  const ids = (rows as { id: string }[]).map((x) => String(x.id ?? "").trim()).filter(Boolean);
  if (ids.length) await removeReportsTargetingListingIds(ids);
  return ids.length;
}

export async function pgSoftDeleteListing(listing: Listing): Promise<boolean> {
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
  await pgReplaceListing(next);
  return true;
}

export async function pgArchiveListingFromTrash(id: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const cur = await pgGetById(clean);
  if (!cur || normalizeListingLifecycle(cur.listingLifecycle) !== "deleted") return false;
  const now = Date.now();
  const next = {
    ...cur,
    listingLifecycle: "archived" as const,
    archivedAt: now,
    deletePermanentlyAt: undefined,
    updatedAt: now,
  } as Listing;
  await pgReplaceListing(next);
  return true;
}

export async function pgDeleteListing(id: string): Promise<boolean> {
  const clean = id.trim();
  if (!clean) return false;
  const { rowCount } = await getPool().query(`DELETE FROM listings WHERE id = $1`, [clean]);
  return (rowCount ?? 0) > 0;
}

export async function pgListListingIdsByOwner(ownerId: string): Promise<string[]> {
  const oid = ownerId.trim();
  if (!oid) return [];
  const { rows } = await getPool().query(`SELECT id FROM listings WHERE owner_id = $1`, [oid]);
  return (rows as { id: string }[])
    .map((r) => String(r.id ?? "").trim())
    .filter(Boolean);
}

export async function pgDeleteListingsByOwner(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { rowCount } = await getPool().query(`DELETE FROM listings WHERE owner_id = $1`, [oid]);
  return rowCount ?? 0;
}

export async function pgDeleteAllListings(): Promise<void> {
  await getPool().query(`DELETE FROM listings`);
}

export async function pgCategoryCounts(): Promise<Record<string, number>> {
  const { rows } = await getPool().query(
    `SELECT category_slug, COUNT(*)::int AS c FROM listings
     WHERE status IN ('auto','approved')
       AND COALESCE(NULLIF(TRIM(deal_status), ''), 'active') = 'active'
       AND COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'live'
       AND TRIM(category_slug) <> ''
     GROUP BY category_slug`,
  );
  const out: Record<string, number> = {};
  for (const row of rows as { category_slug: string; c: number }[]) {
    const slug = (row.category_slug ?? "").trim();
    if (!slug) continue;
    out[slug] = row.c ?? 0;
  }
  return out;
}

export async function pgCountSellerActiveListings(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM listings
     WHERE owner_id = $1
       AND status IN ('auto','approved')
       AND COALESCE(NULLIF(TRIM(deal_status), ''), 'active') = 'active'
       AND COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'live'`,
    [oid],
  );
  const n = (rows[0] as { c?: number } | undefined)?.c;
  return typeof n === "number" ? n : 0;
}

export async function pgCountListingsByOwner(ownerId: string): Promise<number> {
  const oid = ownerId.trim();
  if (!oid) return 0;
  const { rows } = await getPool().query(`SELECT COUNT(*)::int AS c FROM listings WHERE owner_id = $1`, [oid]);
  const n = (rows[0] as { c?: number } | undefined)?.c;
  return typeof n === "number" ? n : 0;
}

export async function pgListPublicListingsByOwner(ownerId: string): Promise<Listing[]> {
  const oid = ownerId.trim();
  if (!oid) return [];
  const { rows } = await getPool().query(
    `SELECT * FROM listings
     WHERE owner_id = $1
       AND status IN ('auto','approved')
       AND COALESCE(NULLIF(TRIM(deal_status), ''), 'active') = 'active'
       AND COALESCE(NULLIF(TRIM(listing_lifecycle), ''), 'live') = 'live'
     ORDER BY updated_at DESC`,
    [oid],
  );
  return rows
    .map((r) => listingFromPersistentRow(r as unknown as Record<string, unknown>))
    .filter((x): x is Listing => Boolean(x))
    .filter((l) => isListingPubliclyListed(l));
}

export async function pgAdPreviewById(id: string): Promise<Record<string, unknown> | null> {
  const listing = await pgGetById(id);
  if (!listing) return null;
  const images =
    isListingPubliclyListed(listing) && Array.isArray(listing.photos) ? listing.photos.slice(0, 5) : [];
  return {
    id: listing.id,
    title: listing.title,
    price: "price" in listing ? listing.price : undefined,
    city: listing.city,
    category: listing.categoryName,
    categorySlug: listing.categorySlug,
    status: listing.status,
    images,
    ownerId: listing.ownerId,
    dealStatus: listing.dealStatus ?? "active",
  };
}
