import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { cancelPendingCall } from "../../../lib/serverCallsStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { callId?: string };
  const callId = String(body.callId ?? "").trim();
  if (!callId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const ok = await cancelPendingCall(callId, userId);
  if (!ok) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({ ok: true });
}
