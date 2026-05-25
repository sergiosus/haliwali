import { NextResponse } from "next/server";
import { listImportCandidateHistory } from "../../../../../lib/serverCatalogImportCandidatesStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const history = await listImportCandidateHistory(10);
  return NextResponse.json({ ok: true, history });
}
