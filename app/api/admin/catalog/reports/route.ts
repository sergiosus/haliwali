import { NextResponse } from "next/server";
import { listCatalogReportsAdmin } from "../../../../lib/serverCatalogStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;
  const reports = await listCatalogReportsAdmin();
  return NextResponse.json({ ok: true, reports });
}
