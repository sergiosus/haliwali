import { NextResponse } from "next/server";
import { ensureCatalogReady, listCatalogCategories } from "../../../lib/serverCatalogStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureCatalogReady();
    const categories = await listCatalogCategories();
    return NextResponse.json({ ok: true, categories });
  } catch {
    return NextResponse.json({ ok: true, categories: [] });
  }
}
