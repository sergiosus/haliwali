import { NextResponse } from "next/server";
import { parseGlobalSearchScopeFromUrl } from "../../../lib/globalSearchScopeParams";
import { globalSearchNormalizedPayload, globalSearchSuggest } from "../../../lib/serverGlobalSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const scope = parseGlobalSearchScopeFromUrl(url);

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
    const message = e instanceof Error ? e.message : "suggest_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
