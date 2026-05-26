import { NextResponse } from "next/server";
import {
  listCatalogCompanyClaimsAdmin,
  reviewCatalogCompanyClaim,
} from "../../../../../lib/serverCatalogStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const claims = await listCatalogCompanyClaimsAdmin();
  return NextResponse.json({ ok: true, claims });
}

export async function PATCH(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const claimId = Number(body.claimId ?? body.id);
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!Number.isFinite(claimId) || claimId <= 0 || !action) {
    return NextResponse.json({ ok: false, error: "INVALID_REQUEST" }, { status: 400 });
  }

  const claim = await reviewCatalogCompanyClaim({
    claimId,
    action,
    reviewedBy: "admin",
  });
  if (!claim) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, claim });
}
