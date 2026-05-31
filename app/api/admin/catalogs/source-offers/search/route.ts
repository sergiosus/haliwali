import { NextResponse } from "next/server";
import {
  searchOffersForAdmin,
  type OfferSearchSourceFilter,
} from "../../../../../lib/catalogOfferAdminSearch";
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

  const body = (await req.json()) as Record<string, unknown>;
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
    return NextResponse.json(out, { status: out.error === "SEARCH_PROVIDER_NONE" ? 503 : 400 });
  }

  return NextResponse.json(out);
}
