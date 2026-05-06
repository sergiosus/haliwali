import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { appendReplySample } from "../../../lib/serverTrustStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { opponentMessageAt?: number };
  const t = body.opponentMessageAt;
  if (typeof t !== "number" || !Number.isFinite(t)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const now = Date.now();
  if (t > now || t < now - 48 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await appendReplySample(userId, now - t);
  return NextResponse.json({ ok: true });
}
