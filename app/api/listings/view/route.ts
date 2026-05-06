import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { maybeIncrementListingView } from "../../../lib/serverTrustStore";

export const runtime = "nodejs";

const VIEWER_COOKIE = "haliwali_vsid";
const COOKIE_MAX = 60 * 60 * 24 * 400;

function viewerCookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as { listingId?: string };
  const listingId = (body.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const jar = await cookies();
  let vid = jar.get(VIEWER_COOKIE)?.value?.trim() ?? "";
  if (!vid) vid = randomBytes(18).toString("hex");

  const { count } = await maybeIncrementListingView(listingId, vid);
  const res = NextResponse.json({ ok: true, count });
  res.cookies.set(VIEWER_COOKIE, vid, viewerCookieOpts(COOKIE_MAX));
  return res;
}
