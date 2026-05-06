import path from "node:path";
import { NextResponse } from "next/server";
import { isDebugAuthServer } from "../../lib/debugAuth";
import { isListingCreationBlocked } from "../../lib/serverAccountDeletion";
import { adminPrivilegesActive } from "../../lib/serverAdminSession";
import { moderationBlockedForbidden } from "../../lib/serverUserModerationBlock";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";
import { readUsersDb } from "../../lib/serverUsersStore";
import type { Listing, ListingDealStatus, ListingStatus, ListingType } from "../../lib/listingModel";
import { authorPublicNameForNewListing } from "../../lib/listingAuthorPublic";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";
import { listBootstrapForClient, insertListing } from "../../lib/serverListingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

function asListingType(raw: unknown): ListingType | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "task" || s === "service" || s === "product_sell" || s === "product_buy") return s;
  return null;
}

function asListingStatus(raw: unknown): ListingStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "pending" || s === "auto" || s === "approved" || s === "rejected") return s;
  return null;
}

function asDealStatus(raw: unknown): ListingDealStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "in_progress" || s === "completed") return s;
  return "active";
}

/** Validate and coerce JSON body into a Listing for create/update. */
export function parseListingBody(body: unknown, ownerIdFromSession: string): Listing | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const editToken = typeof o.editToken === "string" ? o.editToken.trim() : "";
  const type = asListingType(o.type);
  const status = asListingStatus(o.status);
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const categoryName = typeof o.categoryName === "string" ? o.categoryName.trim() : "";
  const categorySlug = typeof o.categorySlug === "string" ? o.categorySlug.trim() : "";
  const city = typeof o.city === "string" ? o.city.trim() : "";
  // City is optional for «Вся Россия» style listings; client enforces location when not in whole-Russia mode.
  if (!id || !editToken || !type || !status || !title || !description || !categoryName || !categorySlug) return null;

  const photos = Array.isArray(o.photos) ? o.photos.filter((x): x is string => typeof x === "string") : [];
  const createdAt = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  const updatedAt = typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt;
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const address = typeof o.address === "string" && o.address.trim() ? o.address.trim() : undefined;
  const lat = typeof o.latitude === "number" && Number.isFinite(o.latitude) ? o.latitude : undefined;
  const lng = typeof o.longitude === "number" && Number.isFinite(o.longitude) ? o.longitude : undefined;
  const addressPublic = o.addressPublic === true;
  const moderationReason = typeof o.moderationReason === "string" ? o.moderationReason : "";

  const base = {
    id,
    editToken,
    ownerId: ownerIdFromSession,
    type,
    status,
    moderationReason,
    dealStatus: asDealStatus(o.dealStatus),
    title,
    description,
    categoryName,
    categorySlug,
    city,
    address,
    latitude: lat,
    longitude: lng,
    addressPublic,
    phone,
    photos,
    createdAt,
    updatedAt,
    location: {
      city,
      address,
      lat,
      lng,
    },
  };

  if (type === "task") {
    return { ...base, type: "task" } as Listing;
  }
  if (type === "service") {
    const specialization = typeof o.specialization === "string" ? o.specialization.trim() : "";
    return { ...base, type: "service", specialization } as Listing;
  }
  const priceRaw = o.price;
  const price = typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : Number(priceRaw);
  if (!Number.isFinite(price)) return null;
  return {
    ...base,
    type,
    price,
  } as Listing;
}

export async function GET() {
  const admin = await adminPrivilegesActive();
  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";
  const listings = await listBootstrapForClient(sessionUserId || null, admin);
  const res = NextResponse.json({ listings });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";
  const ownerDb = await readUsersDb(USERS_PATH);
  const ownerUser = ownerDb.usersById[sessionUserId.trim()];

  if (isDebugAuthServer()) {
    console.log("[auth-api] listings POST", { hasUser: Boolean(ownerUser) });
  }

  if (!sessionUserId.trim()) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (isListingCreationBlocked(ownerUser)) {
    return NextResponse.json(
      {
        error: "ACCOUNT_PENDING_DELETION",
        message:
          "Аккаунт ожидает удаления. Для продолжения работы восстановите аккаунт.",
      },
      { status: 403 },
    );
  }

  const modForbidden = await moderationBlockedForbidden(sessionUserId.trim());
  if (modForbidden) return modForbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const listingRaw = parseListingBody(body, sessionUserId.trim());
  if (!listingRaw) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const listing = {
    ...listingRaw,
    authorPublicName: authorPublicNameForNewListing(ownerUser),
  };

  try {
    await insertListing(listing);
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    if (code === "23505") {
      return NextResponse.json({ error: "DUPLICATE_ID" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, id: listing.id });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
