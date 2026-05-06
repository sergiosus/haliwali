import { NextResponse } from "next/server";
import { adminPrivilegesActive } from "../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { normalizeListingId } from "../../../lib/listingId";
import { adPreviewById, assertListingOwnerOrAdmin, hardDeleteListingById, softDeleteListingById } from "../../../lib/serverListingsStore";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ adId: string }> }) {
  const { adId } = await ctx.params;
  const id = (adId ?? "").trim();
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const cleanId = normalizeListingId(id);
  const ad = await adPreviewById(cleanId);
  if (!ad) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(ad);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ adId: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const admin = await adminPrivilegesActive();
  const sessionUserId = (await getUserIdFromSessionCookie()) ?? "";
  if (!admin && !sessionUserId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { adId } = await ctx.params;
  const id = (adId ?? "").trim();
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const cleanId = normalizeListingId(id);
  const auth = await assertListingOwnerOrAdmin(cleanId, sessionUserId || null, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 404 ? "NOT_FOUND" : "FORBIDDEN" }, { status: auth.status });

  const ok = admin ? await hardDeleteListingById(cleanId) : await softDeleteListingById(cleanId);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: [cleanId] });
}
