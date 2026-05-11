import { NextResponse } from "next/server";
import { applyListingViewViewerCookie, handleRecordListingViewRequest } from "../../../lib/serverListingViewRoute";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";

export const runtime = "nodejs";

/** @deprecated Prefer `POST /api/listings/[id]/view`. */
export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as { listingId?: string; location?: unknown };
  const listingId = (body.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const location =
    body.location && typeof body.location === "object" ?
      (body.location as { city?: string; region?: string; country?: string })
    : {};

  const result = await handleRecordListingViewRequest(req, listingId, { location });
  const res = NextResponse.json(result.body, { status: result.status });
  if (result.status === 200) applyListingViewViewerCookie(res, result.setViewerCookie);
  return res;
}
