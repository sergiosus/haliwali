import { NextResponse } from "next/server";
import { listCatalogImportSessions } from "../../../../../lib/serverCatalogImportSessionStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const sessions = await listCatalogImportSessions(40);
  return NextResponse.json({ ok: true, sessions });
}
