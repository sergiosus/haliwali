import { NextResponse } from "next/server";
import { fetchExternalSearchResults } from "../../lib/externalSearch";
import { parseGlobalSearchScopeFromUrl } from "../../lib/globalSearchScopeParams";
import type { GlobalSearchListingTypeFilter } from "../../lib/globalSearchTypes";
import { globalSearchListings, globalSearchNormalizedPayload } from "../../lib/serverGlobalSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseType(raw: string | null): GlobalSearchListingTypeFilter {
  const t = (raw ?? "all").trim().toLowerCase();
  if (t === "task" || t === "service" || t === "product") return t;
  return "all";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const type = parseType(url.searchParams.get("type"));
    const limitRaw = Number(url.searchParams.get("limit") ?? "40");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 40;
    const scope = parseGlobalSearchScopeFromUrl(url);

    const { normalized, results } = await globalSearchListings({ query: q, type, limit, scope });
    const externalResults = await fetchExternalSearchResults(q);

    const res = NextResponse.json({
      ok: true,
      query: q,
      normalized: globalSearchNormalizedPayload(normalized),
      results,
      externalResults,
    });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "search_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
