import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { getCall, setCallAnswerJson, setCallOfferJson } from "../../../lib/serverCallsStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    callId?: string;
    type?: string;
    sdp?: Record<string, unknown>;
  };
  const callId = String(body.callId ?? "").trim();
  const type = String(body.type ?? "").trim().toLowerCase();
  if (!callId || (type !== "offer" && type !== "answer")) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.sdp || typeof body.sdp !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const call = await getCall(callId);
  if (!call) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!call.participantIds.includes(userId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (call.status !== "pending" && call.status !== "active") {
    return NextResponse.json({ error: "NOT_ACTIVE" }, { status: 409 });
  }

  const json = JSON.stringify(body.sdp);

  if (type === "offer") {
    if (userId !== call.callerId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    await setCallOfferJson(callId, json);
  } else {
    if (userId === call.callerId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    await setCallAnswerJson(callId, json);
  }

  return NextResponse.json({ ok: true });
}
