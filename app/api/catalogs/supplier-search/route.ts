import { NextResponse } from "next/server";
import { searchCatalogSuppliers } from "../../../lib/catalogSupplierSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const city = searchParams.get("city")?.trim() || undefined;
  const categorySlug =
    (searchParams.get("category") ?? searchParams.get("categorySlug"))?.trim().toLowerCase() || undefined;
  const limit = Number(searchParams.get("limit") ?? 24);

  if (q.length < 2) {
    return NextResponse.json({ ok: true, companies: [], sourceOffers: [] });
  }

  const result = await searchCatalogSuppliers({
    q,
    city,
    categorySlug,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 48) : 24,
  });

  return NextResponse.json({ ok: true, ...result });
}
