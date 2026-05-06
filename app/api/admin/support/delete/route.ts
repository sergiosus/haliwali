import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { deleteSupportTicketById } from "../../../../lib/serverSupportStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  let data: unknown = null;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const id = typeof (data as { id?: unknown } | null)?.id === "string" ? (data as { id: string }).id.trim() : "";
  if (!id) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });

  const ok = await deleteSupportTicketById(id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ success: true });
}

