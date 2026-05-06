import { NextResponse } from "next/server";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { getCall } from "../../../lib/serverCallsStore";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const callId = (url.searchParams.get("callId") ?? "").trim();
  if (!callId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const call = await getCall(callId);
  if (!call) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!call.participantIds.includes(userId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({
    ok: true,
    offerJson: call.offerJson ?? null,
    answerJson: call.answerJson ?? null,
    iceFromCaller: call.iceFromCaller ?? [],
    iceFromCallee: call.iceFromCallee ?? [],
  });
}
