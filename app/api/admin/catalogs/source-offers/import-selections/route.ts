import { NextResponse } from "next/server";
import { processSourceOfferSearchSelections } from "../../../../../lib/catalogSourceOfferExtractionService";
import type { SourceOfferSearchSelection } from "../../../../../lib/catalogSourceOfferExtractionService";
import { parseCatalogSourceOfferType } from "../../../../../lib/catalogSourceOfferType";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSelections(raw: unknown): SourceOfferSearchSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceOfferSearchSelection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    if (!url) continue;
    out.push({
      url,
      title: String(o.title ?? ""),
      price: o.price != null ? String(o.price) : null,
      city: String(o.city ?? ""),
      companyName: String(o.companyName ?? ""),
      sellerName: String(o.sellerName ?? ""),
      sourceName: String(o.sourceName ?? "other") as SourceOfferSearchSelection["sourceName"],
      shortSnippet: String(o.shortSnippet ?? o.title ?? ""),
      brand: o.brand != null ? String(o.brand) : null,
      oemCodes: Array.isArray(o.oemCodes) ? o.oemCodes.map(String) : [],
      articleCodes: Array.isArray(o.articleCodes) ? o.articleCodes.map(String) : [],
      coverImageUrl: o.coverImageUrl != null ? String(o.coverImageUrl) : null,
      offerType:
        o.offerType != null ?
          parseCatalogSourceOfferType(String(o.offerType))
        : undefined,
      parseQuality: o.parseQuality === "search_card" ? "search_card" : "link_only",
      year: o.year != null ? Number(o.year) : null,
      mileageKm: o.mileageKm != null ? Number(o.mileageKm) : null,
    });
  }
  return out;
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const categorySlug = String(body.categorySlug ?? body.category ?? "")
    .trim()
    .toLowerCase();
  const city = String(body.city ?? "").trim();
  const selections = parseSelections(body.selections);

  if (!categorySlug) {
    return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
  }
  if (selections.length === 0) {
    return NextResponse.json({ ok: false, error: "SELECTIONS_REQUIRED" }, { status: 400 });
  }

  try {
    const { drafts, errors, outcomes } = await processSourceOfferSearchSelections(selections, {
      categorySlug,
      city,
    });

    return NextResponse.json({
      ok: true,
      sourceOfferDrafts: drafts,
      count: drafts.length,
      errors,
      outcomes,
      createdCount: outcomes.filter((o) => o.status === "created").length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "IMPORT_FAILED", message, outcomes: [], errors: [] },
      { status: 500 },
    );
  }
}
