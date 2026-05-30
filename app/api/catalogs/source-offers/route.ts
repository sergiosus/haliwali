import { NextResponse } from "next/server";
import { listPublishedSourceOffers } from "../../../lib/serverCatalogSourceOfferStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const categorySlug = searchParams.get("category") ?? searchParams.get("categorySlug") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? 48);

  const offers = await listPublishedSourceOffers({
    q,
    categorySlug,
    city,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 48,
  });

  return NextResponse.json({ ok: true, offers });
}
