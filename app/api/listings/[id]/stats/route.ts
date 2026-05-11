import { NextResponse } from "next/server";
import { adminPrivilegesActive } from "../../../../lib/serverAdminSession";
import { getListingById } from "../../../../lib/serverListingsStore";
import { getListingViewStatsForOwner } from "../../../../lib/serverListingViews";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const listingId = (raw ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const listing = await getListingById(listingId);
  if (!listing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const sessionUserId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  const admin = await adminPrivilegesActive();
  const ownerUserId = (listing.ownerId ?? "").trim();
  const isOwner = Boolean(sessionUserId && ownerUserId && sessionUserId === ownerUserId);
  if (!admin && !isOwner) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const stats = await getListingViewStatsForOwner(listingId);
  if (!stats) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });

  return NextResponse.json({
    ok: true,
    listingId,
    readOnly: admin && !isOwner,
    stats,
  });
}
