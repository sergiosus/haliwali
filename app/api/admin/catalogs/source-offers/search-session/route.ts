import { NextResponse } from "next/server";
import {
  clearOfferSearchSession,
  getLatestOfferSearchSession,
} from "../../../../../lib/serverCatalogOfferSearchSessionStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const session = await getLatestOfferSearchSession();
  if (!session) {
    return NextResponse.json({ ok: true, session: null });
  }

  return NextResponse.json({
    ok: true,
    session,
    results: session.results,
    skipped: session.skipped,
    stats: session.stats,
    message: session.message,
    emptyReason: session.emptyReason,
    query: session.query,
    city: session.city,
    brand: session.brand,
    oemArticle: session.oemArticle,
    sourceFilter: session.sourceFilter,
    priceMin: session.priceMin,
    priceMax: session.priceMax,
  });
}

export async function DELETE() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  await clearOfferSearchSession();
  return NextResponse.json({ ok: true });
}
