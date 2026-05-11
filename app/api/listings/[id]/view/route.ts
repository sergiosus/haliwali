import { NextResponse } from "next/server";
import { applyListingViewViewerCookie, handleRecordListingViewRequest } from "../../../../lib/serverListingViewRoute";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const { id } = await ctx.params;
  let location = {};
  try {
    const body = (await req.json()) as { location?: unknown };
    if (body && typeof body === "object" && body.location && typeof body.location === "object") {
      const o = body.location as Record<string, unknown>;
      location = {
        ...(typeof o.city === "string" ? { city: o.city } : {}),
        ...(typeof o.region === "string" ? { region: o.region } : {}),
        ...(typeof o.country === "string" ? { country: o.country } : {}),
      };
    }
  } catch {
    location = {};
  }
  const result = await handleRecordListingViewRequest(req, id ?? "", { location });
  const res = NextResponse.json(result.body, { status: result.status });
  if (result.status === 200) applyListingViewViewerCookie(res, result.setViewerCookie);
  return res;
}
