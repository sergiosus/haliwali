import { NextResponse } from "next/server";
import { parseGlobalSearchScopeFromUrl } from "../../../lib/globalSearchScopeParams";
import { normalizeGlobalSearchQuery, globalSearchNormalizedPayload } from "../../../lib/globalSearchNormalize";
import { globalSearchSuggest } from "../../../lib/serverGlobalSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function warnSuggestRouteError(e: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  const detail = e instanceof Error ? e.stack ?? e.message : String(e);
  console.warn("[api/search/suggest]", detail);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const scope = parseGlobalSearchScopeFromUrl(url);

  try {
    const { normalized, suggestions } = await globalSearchSuggest({ query: q, scope });

    const res = NextResponse.json({
      ok: true,
      query: q,
      normalized: globalSearchNormalizedPayload(normalized),
      suggestions,
    });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e) {
    warnSuggestRouteError(e);
    const normalized = normalizeGlobalSearchQuery(q);
    const res = NextResponse.json({
      ok: true,
      query: q,
      normalized: globalSearchNormalizedPayload(normalized),
      suggestions: [],
    });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }
}
