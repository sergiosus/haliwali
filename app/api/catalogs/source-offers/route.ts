import { NextResponse } from "next/server";
import { parseSourceOfferListQuery } from "../../../lib/catalogSourceOfferQuery";
import { listPublishedSourceOffers } from "../../../lib/serverCatalogSourceOfferStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const query = parseSourceOfferListQuery(new URL(req.url).searchParams);
  const offers = await listPublishedSourceOffers(query);
  return NextResponse.json({ ok: true, offers });
}
