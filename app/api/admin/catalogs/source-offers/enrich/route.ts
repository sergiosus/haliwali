import { NextResponse } from "next/server";
import { extractSourceOfferFromHtml } from "../../../../../lib/catalogSourceOfferExtract";
import { fetchPublicHtml } from "../../../../../lib/catalogHtmlFetch";
import { sanitizeSourceOfferDraftInput } from "../../../../../lib/catalogSourceOfferNormalize";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const url = String(body.url ?? "").trim();
  const city = String(body.city ?? "").trim();
  const categorySlug = String(body.categorySlug ?? "").trim().toLowerCase();
  if (!url) return NextResponse.json({ ok: false, error: "URL_REQUIRED" }, { status: 400 });

  try {
    const fetched = await fetchPublicHtml(url, true, { timeoutMs: 8_000 });
    const enriched = extractSourceOfferFromHtml(fetched, { city, categorySlug: categorySlug || "drugie" });
    if (!enriched) {
      return NextResponse.json({ ok: true, enriched: null, warning: "enrich_failed" });
    }
    const draft = sanitizeSourceOfferDraftInput(enriched);
    if (!draft) return NextResponse.json({ ok: true, enriched: null, warning: "enrich_failed" });

    return NextResponse.json({
      ok: true,
      enriched: {
        title: draft.title,
        city: draft.city,
        brand: draft.brand,
        price: draft.price,
        priceAmount: draft.priceAmount ?? null,
        priceText: draft.priceText ?? null,
        coverImageUrl: draft.coverImageUrl ?? null,
        imageSource: typeof draft.rawPayload?.imageSource === "string" ? draft.rawPayload.imageSource : "none",
        priceSource: typeof draft.rawPayload?.priceSource === "string" ? draft.rawPayload.priceSource : "none",
        titleSource: typeof draft.rawPayload?.titleSource === "string" ? draft.rawPayload.titleSource : "listing",
        shortSnippet: draft.shortSnippet,
      },
    });
  } catch {
    return NextResponse.json({ ok: true, enriched: null, warning: "timeout_or_blocked" });
  }
}

