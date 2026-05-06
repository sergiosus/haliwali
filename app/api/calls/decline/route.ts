import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { getCall, updateCall } from "../../../lib/serverCallsStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { callId?: string };
  const callId = String(body.callId ?? "").trim();
  if (!callId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const call = await getCall(callId);
  if (!call) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!call.participantIds.includes(userId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (call.status !== "pending") return NextResponse.json({ error: "NOT_PENDING" }, { status: 409 });
  if (userId === call.callerId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const next = await updateCall(callId, { status: "declined" });
  return NextResponse.json({ ok: true, call: next });
}

