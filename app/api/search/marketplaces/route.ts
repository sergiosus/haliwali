import { NextResponse } from "next/server";
import { aggregateExternalMarketplaceResults } from "../../../lib/externalMarketplaceAggregation";
import { checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_PATH = "search_marketplaces_ip";
const RL_LIMIT = 30;
const RL_WINDOW_MS = 60_000;

/** Lazy product marketplace aggregation (internal search loads separately). */
export async function GET(req: Request) {
  try {
    const ip = extractIp(req);
    const rl = await checkIpRateLimit({
      path: RL_PATH,
      ip,
      limit: RL_LIMIT,
      windowMs: RL_WINDOW_MS,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT", cards: [], restrictedLinks: [] },
        { status: 429 },
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({
        ok: true,
        query: q,
        normalizedQuery: "",
        cards: [],
        restrictedLinks: [],
        providerErrors: {},
      });
    }

    const includeAuto = url.searchParams.get("auto") === "1";
    const isPreview = url.searchParams.get("preview") === "1";
    const limitRaw = Number(url.searchParams.get("limit") ?? (isPreview ? "5" : "10"));
    const maxCards = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 10) : 10;
    const result = await aggregateExternalMarketplaceResults(q, {
      category: "product",
      includeAuto: isPreview ? false : includeAuto,
      maxCards,
      includeRestrictedLinks: !isPreview,
    });

    const res = NextResponse.json({
      ok: true,
      query: q,
      normalizedQuery: result.normalizedQuery,
      cards: result.cards,
      restrictedLinks: result.restrictedLinks,
      providerErrors: result.providerErrors,
    });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "marketplace_search_failed";
    return NextResponse.json({ ok: false, error: message, cards: [], restrictedLinks: [] }, { status: 500 });
  }
}
