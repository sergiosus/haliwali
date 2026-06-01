import { NextResponse } from "next/server";
import { parseSourceOfferListQuery } from "../../../lib/catalogSourceOfferQuery";
import { listPublishedSourceOffers } from "../../../lib/serverCatalogSourceOfferStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const query = parseSourceOfferListQuery(new URL(req.url).searchParams);
    const { offers, total } = await listPublishedSourceOffers(query);
    return NextResponse.json({
      ok: true,
      offers,
      total,
      tableUsed: "catalog_source_offers",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[source-offers] public list failed:", message);
    return NextResponse.json(
      { ok: false, offers: [], total: 0, error: message, tableUsed: "catalog_source_offers" },
      { status: 500 },
    );
  }
}
