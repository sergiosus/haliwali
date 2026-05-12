import { NextResponse } from "next/server";
import {
  hasUserBlockedPeer,
  isChatBlockedBetweenUsers,
  setUserBlockedPeer,
} from "../../../../lib/serverChatUserBlocksStore";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

function parsePeerUserId(req: Request, body?: Record<string, unknown>): string {
  const fromBody = body && typeof body.peerUserId === "string" ? body.peerUserId.trim() : "";
  if (fromBody) return fromBody;
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("peerUserId") ?? "").trim();
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const peerUserId = parsePeerUserId(req);
  if (!peerUserId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (peerUserId === uid) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const blockedBetween = await isChatBlockedBetweenUsers(uid, peerUserId);
  const blockedByMe = await hasUserBlockedPeer(uid, peerUserId);
  const blockedByPeer = await hasUserBlockedPeer(peerUserId, uid);

  return NextResponse.json({
    ok: true,
    blockedBetween,
    blockedByMe,
    blockedByPeer,
  });
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const peerUserId = parsePeerUserId(req, o);
  if (!peerUserId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const result = await setUserBlockedPeer(uid, peerUserId, true);
  if (result === "self") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (result === "invalid") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const peerUserId = parsePeerUserId(req, o);
  if (!peerUserId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const result = await setUserBlockedPeer(uid, peerUserId, false);
  if (result === "self" || result === "invalid") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  return NextResponse.json({ ok: true });
}
