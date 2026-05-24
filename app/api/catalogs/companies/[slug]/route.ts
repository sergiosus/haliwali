import { NextResponse } from "next/server";
import {
  ensureCatalogReady,
  getCatalogCompanyBySlug,
  getRelatedCatalogCompanies,
} from "../../../../lib/serverCatalogStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureCatalogReady();
    const { slug } = await ctx.params;
    const company = await getCatalogCompanyBySlug(slug);
    if (!company) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    const related = await getRelatedCatalogCompanies(company.categorySlug, company.slug, 4);
    return NextResponse.json({ ok: true, company, related });
  } catch {
    return NextResponse.json({ ok: false, error: "FAILED" }, { status: 500 });
  }
}
