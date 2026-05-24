import path from "node:path";
import { NextResponse } from "next/server";
import { isListingCreationBlocked } from "../../../lib/serverAccountDeletion";
import { adminPrivilegesActive } from "../../../lib/serverAdminSession";
import { moderationBlockedForbidden } from "../../../lib/serverUserModerationBlock";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { readUsersDb } from "../../../lib/serverUsersStore";
import type { ListingStatus } from "../../../lib/listingModel";
import { normalizeListingId } from "../../../lib/listingId";
import { persistAuthorPublicNameOnListingUpdate } from "../../../lib/listingAuthorPublic";
import { normalizeListingLifecycle } from "../../../lib/listingModel";
import {
  assertListingOwnerOrAdmin,
  archiveListingFromTrash,
  getListingById,
  getListingForViewer,
  hardDeleteListingById,
  patchDealStatus,
  patchListingStatus,
  permanentDeleteListingByUser,
  replaceListing,
  softDeleteListingById,
} from "../../../lib/serverListingsStore";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { diagnoseListingBodyReject, parseListingBody } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = normalizeListingId(raw ?? "");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const admin = await adminPrivilegesActive();
  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";
  const listing = await getListingForViewer(id, sessionUserId || null, admin);
  if (!listing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const res = NextResponse.json({ listing });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const { id: raw } = await ctx.params;
  const id = normalizeListingId(raw ?? "");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const admin = await adminPrivilegesActive();
  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const action = typeof o.action === "string" ? o.action.trim() : "";
  if (action === "archive_from_trash") {
    const auth = await assertListingOwnerOrAdmin(id, sessionUserId || null, admin);
    if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });
    const ok = await archiveListingFromTrash(id);
    if (!ok) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (action === "permanent_delete") {
    const auth = await assertListingOwnerOrAdmin(id, sessionUserId || null, admin);
    if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });
    const ok = await permanentDeleteListingByUser(id);
    if (!ok) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (admin && typeof o.status === "string" && typeof o.title !== "string") {
    const st = o.status as ListingStatus;
    if (st !== "pending" && st !== "auto" && st !== "approved" && st !== "rejected") {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const moderationReason = typeof o.moderationReason === "string" ? o.moderationReason : "";
    const ok = await patchListingStatus(id, st, moderationReason);
    if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (typeof o.dealStatus === "string" && typeof o.title !== "string") {
    const auth = await assertListingOwnerOrAdmin(id, sessionUserId || null, admin);
    if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });
    const curDeal = await getListingById(id);
    if (curDeal && normalizeListingLifecycle(curDeal.listingLifecycle) !== "live" && !admin) {
      return NextResponse.json({ error: "LISTING_NOT_EDITABLE" }, { status: 400 });
    }
    const ds = o.dealStatus.trim();
    if (ds !== "active" && ds !== "in_progress" && ds !== "completed") {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const ok = await patchDealStatus(id, ds);
    if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const uid = sessionUserId.trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const ownerDb = await readUsersDb(USERS_PATH);
  const ownerUser = ownerDb.usersById[uid];
  if (isListingCreationBlocked(ownerUser)) {
    return NextResponse.json({ error: "ACCOUNT_PENDING_DELETION" }, { status: 403 });
  }

  const modForbidden = await moderationBlockedForbidden(uid);
  if (modForbidden) return modForbidden;

  const prevFull = await getListingById(id);
  if (prevFull && normalizeListingLifecycle(prevFull.listingLifecycle) !== "live" && !admin) {
    return NextResponse.json({ error: "LISTING_NOT_EDITABLE" }, { status: 400 });
  }

  const bodyId =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string"
      ? normalizeListingId(String((body as Record<string, unknown>).id))
      : "";
  const parsed = parseListingBody(
    body && typeof body === "object" ? { ...(body as object), id: bodyId || id } : body,
    uid,
  );
  if (!parsed || normalizeListingId(parsed.id) !== id) {
    const reject = diagnoseListingBodyReject(body);
    const bodyRec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const photosRaw = bodyRec.photos;
    const photoCount = Array.isArray(photosRaw) ? photosRaw.length : 0;
    const photoTypes = Array.isArray(photosRaw)
      ? [...new Set(photosRaw.map((x) => typeof x))].join(",")
      : "";
    console.log("[LISTING_EDIT]", {
      listingId: id,
      bodyId: bodyId || null,
      parsedId: parsed?.id ?? null,
      reject,
      payloadKeys: Object.keys(bodyRec),
      photoCount,
      photoTypes,
      type: typeof bodyRec.type === "string" ? bodyRec.type : null,
      hasPrice: "price" in bodyRec,
    });
    return NextResponse.json(
      { error: "BAD_REQUEST", reason: reject ?? "id_mismatch" },
      { status: 400 },
    );
  }

  const auth = await assertListingOwnerOrAdmin(id, uid, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });
  if (!prevFull) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  let listing = persistAuthorPublicNameOnListingUpdate(prevFull, parsed, ownerUser);
  listing = {
    ...listing,
    listingLifecycle: prevFull.listingLifecycle,
    deletedAt: prevFull.deletedAt,
    deletePermanentlyAt: prevFull.deletePermanentlyAt,
    archivedAt: prevFull.archivedAt,
    deletedSnapshot: prevFull.deletedSnapshot,
  } as typeof listing;

  try {
    await replaceListing(listing);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "replace_failed";
    console.log("[LISTING_EDIT]", { listingId: id, stage: "replace", error: msg });
    console.error(e);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const { id: raw } = await ctx.params;
  const id = normalizeListingId(raw ?? "");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const admin = await adminPrivilegesActive();
  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";
  const auth = await assertListingOwnerOrAdmin(id, sessionUserId || null, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });

  const ok = admin ? await hardDeleteListingById(id) : await softDeleteListingById(id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
