import type {
  DeletedListingSnapshot,
  Listing,
  ListingDealStatus,
  ListingLifecycle,
  ListingStatus,
  ListingType,
  ProductListing,
  ServiceListing,
} from "./listingModel";

export function parsePhotosJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function asDealStatus(raw: unknown): ListingDealStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "in_progress" || s === "completed") return s;
  return "active";
}

function asListingStatus(raw: unknown): ListingStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "pending" || s === "rejected" || s === "auto" || s === "approved") return s;
  return "pending";
}

function asListingType(raw: unknown): ListingType | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "task" || s === "service" || s === "product_sell" || s === "product_buy") return s;
  return null;
}

function asListingLifecycle(raw: unknown): ListingLifecycle | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "live" || s === "deleted" || s === "archived") return s;
  return undefined;
}

function readOptionalMillis(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseDeletedSnapshot(raw: unknown): DeletedListingSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : "";
  const category = typeof o.category === "string" ? o.category : "";
  const type = typeof o.type === "string" ? o.type : "";
  const city = typeof o.city === "string" ? o.city : "";
  const preview = typeof o.preview === "string" ? o.preview : "";
  if (!title && !preview) return undefined;
  return { title, category, type, city, preview };
}

/** Map DB / JSON file row to `Listing` (full server record). */
export function listingFromPersistentRow(row: Record<string, unknown>): Listing | null {
  const type = asListingType(row.type);
  if (!type) return null;
  const id = typeof row.id === "string" ? row.id : "";
  const editToken = typeof row.editToken === "string" ? row.editToken : typeof row.edit_token === "string" ? row.edit_token : "";
  if (!id || !editToken) return null;

  const ownerRaw = row.ownerId ?? row.owner_id;
  const ownerId = typeof ownerRaw === "string" && ownerRaw.trim() ? ownerRaw.trim() : undefined;
  const apnRaw = row.authorPublicName ?? row.author_public_name;
  const authorPublicName =
    typeof apnRaw === "string" && apnRaw.trim() ? apnRaw.trim() : undefined;

  const listingLifecycle = asListingLifecycle(row.listingLifecycle ?? row.listing_lifecycle);
  const deletedAt = readOptionalMillis(row.deletedAt ?? row.deleted_at);
  const deletePermanentlyAt = readOptionalMillis(row.deletePermanentlyAt ?? row.delete_permanently_at);
  const archivedAt = readOptionalMillis(row.archivedAt ?? row.archived_at);
  const deletedSnapshot = parseDeletedSnapshot(row.deletedSnapshot ?? row.deleted_snapshot);

  const base = {
    id,
    editToken,
    ownerId,
    type,
    status: asListingStatus(row.status),
    moderationReason: typeof row.moderationReason === "string" ? row.moderationReason : typeof row.moderation_reason === "string" ? row.moderation_reason : "",
    dealStatus: asDealStatus(row.dealStatus ?? row.deal_status),
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : "",
    categoryName: typeof row.categoryName === "string" ? row.categoryName : typeof row.category_name === "string" ? row.category_name : "",
    categorySlug: typeof row.categorySlug === "string" ? row.categorySlug : typeof row.category_slug === "string" ? row.category_slug : "",
    city: typeof row.city === "string" ? row.city : "",
    address: typeof row.address === "string" && row.address.trim() ? row.address : undefined,
    latitude: typeof row.latitude === "number" && Number.isFinite(row.latitude) ? row.latitude : undefined,
    longitude: typeof row.longitude === "number" && Number.isFinite(row.longitude) ? row.longitude : undefined,
    addressPublic: Boolean(row.addressPublic ?? row.address_public),
    phone: typeof row.phone === "string" ? row.phone : undefined,
    photos: parsePhotosJson(row.photos),
    createdAt: typeof row.createdAt === "number" ? row.createdAt : typeof row.created_at === "number" ? row.created_at : Date.now(),
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : typeof row.updated_at === "number" ? row.updated_at : undefined,
    ...(authorPublicName ? { authorPublicName } : {}),
    ...(listingLifecycle && listingLifecycle !== "live" ? { listingLifecycle } : {}),
    ...(typeof deletedAt === "number" ? { deletedAt } : {}),
    ...(typeof deletePermanentlyAt === "number" ? { deletePermanentlyAt } : {}),
    ...(typeof archivedAt === "number" ? { archivedAt } : {}),
    ...(deletedSnapshot ? { deletedSnapshot } : {}),
  };

  const city = base.city;
  const address = base.address;
  const lat = base.latitude;
  const lng = base.longitude;
  const location =
    city || address || (typeof lat === "number" && typeof lng === "number")
      ? {
          city,
          address: address || undefined,
          lat: typeof lat === "number" ? lat : undefined,
          lng: typeof lng === "number" ? lng : undefined,
        }
      : undefined;

  if (type === "task") {
    return { ...base, type: "task", location } as Listing;
  }
  if (type === "service") {
    const specialization = typeof row.specialization === "string" ? row.specialization : "";
    const s: ServiceListing = { ...base, type: "service", specialization, location };
    return s;
  }
  const priceRaw = row.price;
  const price = typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : Number(priceRaw);
  return {
    ...base,
    type: type as "product_sell" | "product_buy",
    price: Number.isFinite(price) ? price : 0,
    location,
  } as ProductListing;
}

export function listingToPersistentRow(listing: Listing): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: listing.id,
    edit_token: listing.editToken,
    owner_id: listing.ownerId ?? "",
    type: listing.type,
    status: listing.status,
    moderation_reason: listing.moderationReason ?? "",
    deal_status: listing.dealStatus ?? "active",
    title: listing.title,
    description: listing.description,
    category_name: listing.categoryName,
    category_slug: listing.categorySlug,
    city: listing.city,
    address: listing.address ?? null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    address_public: Boolean(listing.addressPublic),
    phone: listing.phone ?? "",
    photos: listing.photos ?? [],
    created_at: listing.createdAt,
    updated_at: listing.updatedAt ?? listing.createdAt,
    author_public_name: listing.authorPublicName ?? "",
    listing_lifecycle: listing.listingLifecycle ?? "live",
    deleted_at: listing.deletedAt ?? null,
    delete_permanently_at: listing.deletePermanentlyAt ?? null,
    archived_at: listing.archivedAt ?? null,
    deleted_snapshot: listing.deletedSnapshot ?? null,
  };
  if (listing.type === "service") {
    row.specialization = listing.specialization ?? "";
  } else {
    row.specialization = null;
  }
  if (listing.type === "product_sell" || listing.type === "product_buy") {
    row.price = listing.price;
  } else {
    row.price = null;
  }
  return row;
}
