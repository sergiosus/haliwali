import { NextResponse } from "next/server";
import { aggregateMarketplacePageSearch } from "../../../lib/externalMarketplaceAggregation";
import { checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_PATH = "marketplaces_page_ip";
const RL_LIMIT = 40;
const RL_WINDOW_MS = 60_000;

/** API-first gateway: real product cards + outbound search actions per selected provider. */
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
        {
          ok: false,
          error: "RATE_LIMIT",
          items: [],
          actions: [],
          selectedProviders: [],
          normalizedQuery: "",
        },
        { status: 429 },
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const providersParam = url.searchParams.get("providers") ?? "";
    const providerIds = providersParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (q.length < 2) {
      return NextResponse.json({
        ok: true,
        query: q,
        normalizedQuery: "",
        items: [],
        actions: [],
        selectedProviders: [],
      });
    }

    if (providerIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_PROVIDERS",
          items: [],
          actions: [],
          selectedProviders: [],
          normalizedQuery: "",
        },
        { status: 400 },
      );
    }

    const result = await aggregateMarketplacePageSearch(q, providerIds);

    return NextResponse.json({
      ok: true,
      query: q,
      normalizedQuery: result.normalizedQuery,
      queryVariants: result.queryVariants,
      items: result.items,
      actions: result.actions,
      selectedProviders: result.selectedProviders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "marketplace_page_search_failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        items: [],
        actions: [],
        selectedProviders: [],
        normalizedQuery: "",
      },
      { status: 500 },
    );
  }
}
