import { NextResponse } from "next/server";
import { ensureCatalogReady, searchCatalogCompanies } from "../../../lib/serverCatalogStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureCatalogReady();
    const url = new URL(req.url);
    const category = (url.searchParams.get("category") ?? "").trim() || undefined;
    const q = (url.searchParams.get("q") ?? "").trim() || undefined;
    const companies = await searchCatalogCompanies({ categorySlug: category, q });
    return NextResponse.json({ ok: true, companies });
  } catch {
    return NextResponse.json({ ok: true, companies: [] });
  }
}
