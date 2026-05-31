import { NextResponse } from "next/server";
import {
  searchOffersForAdmin,
  type OfferSearchSourceFilter,
} from "../../../../../lib/catalogOfferAdminSearch";
import { formatOfferSearchApiError } from "../../../../../lib/catalogOfferSearchApiError";
import { logCatalogOfferSearch } from "../../../../../lib/catalogCatalogLog";
import { saveOfferSearchSession } from "../../../../../lib/serverCatalogOfferSearchSessionStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSourceFilter(v: unknown): OfferSearchSourceFilter {
  const s = String(v ?? "all").trim().toLowerCase();
  if (
    s === "avito" ||
    s === "drom" ||
    s === "youla" ||
    s === "vk" ||
    s === "company_site" ||
    s === "other" ||
    s === "all"
  ) {
    return s;
  }
  return "all";
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (err) {
    const searchError = formatOfferSearchApiError(err, { includeStack: true });
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_JSON",
        message: searchError.message,
        results: [],
        stats: { linksExtracted: 0, diagnostics: [] },
        searchError,
      },
      { status: 400 },
    );
  }

  const query = String(body.query ?? "").trim();
  const city = String(body.city ?? "").trim();
  const brand = String(body.brand ?? "").trim();
  const oemArticle = String(body.oemArticle ?? body.oem ?? body.article ?? "").trim();
  const sourceFilter = parseSourceFilter(body.source);
  const priceMinRaw = body.priceMin;
  const priceMaxRaw = body.priceMax;
  const priceMin =
    priceMinRaw != null && String(priceMinRaw).trim() !== "" ? Number(priceMinRaw) : undefined;
  const priceMax =
    priceMaxRaw != null && String(priceMaxRaw).trim() !== "" ? Number(priceMaxRaw) : undefined;

  try {
    logCatalogOfferSearch("api_search_request", {
      query: query.slice(0, 60),
      sourceFilter,
      city: city.slice(0, 40),
    });

    const out = await searchOffersForAdmin({
      query,
      city,
      brand,
      oemArticle,
      sourceFilter,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    });

    if (!out.ok) {
      return NextResponse.json(out, { status: 400 });
    }

    let sessionId: number | null = null;
    try {
      const session = await saveOfferSearchSession({
        query,
        city,
        brand,
        oemArticle,
        sourceFilter,
        priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
        priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
        results: out.results,
        skipped: out.skipped ?? [],
        message: out.message,
        emptyReason: out.emptyReason,
        stats: out.stats,
      });
      sessionId = session?.id ?? null;
    } catch (saveErr) {
      const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
      logCatalogOfferSearch("session_save_failed", { error: saveMsg });
    }

    return NextResponse.json({ ...out, sessionId });
  } catch (err) {
    const searchError = formatOfferSearchApiError(err, { includeStack: true });
    logCatalogOfferSearch("api_search_failed", {
      error: searchError.message,
      file: searchError.file,
      line: searchError.line,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "SEARCH_FAILED",
        message: searchError.message,
        results: [],
        emptyReason: "SEARCH_FAILED",
        stats: {
          linksExtracted: 0,
          beforeRelevanceFilter: 0,
          relevantCount: 0,
          relevanceRejected: 0,
          relevanceFilterFailed: false,
          pagesScanned: 0,
          afterCityFilter: 0,
          afterPriceFilter: 0,
          afterBrandOemFilter: 0,
          afterDuplicateFilter: 0,
          sourceCounts: {},
          hidden: {},
          diagnostics: [],
          directSearchUrls: {},
          pagesPerSource: 3,
        },
        searchError,
      },
      { status: 500 },
    );
  }
}
