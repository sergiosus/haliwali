import { NextResponse } from "next/server";
import { adminPrivilegesActive } from "../../lib/serverAdminSession";
import { deleteAllListings } from "../../lib/serverListingsStore";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";

export const runtime = "nodejs";

/** @deprecated Listing writes use `POST /api/listings`. */
export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  return NextResponse.json({ error: "DEPRECATED_USE_POST_API_LISTINGS" }, { status: 410 });
}

export async function DELETE(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const admin = await adminPrivilegesActive();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await deleteAllListings();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
