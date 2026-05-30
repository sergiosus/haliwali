import { NextResponse } from "next/server";
import { getSourceOfferAdminStatus } from "../../../../../lib/serverCatalogSourceOfferStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const status = await getSourceOfferAdminStatus();
  return NextResponse.json({ ok: true, ...status });
}
