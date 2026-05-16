import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { fetchStoredUserById } from "../../../lib/serverUsersStore";
import { createCall, findActiveOrPendingCall } from "../../../lib/serverCallsStore";
import { chatUserBlockedForbidden } from "../../../lib/serverChatUserBlock";
import {
  isListingConversationParticipant,
  parseListingConversationId,
} from "../../../lib/serverListingChatsStore";
import path from "node:path";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");
const isDev = process.env.NODE_ENV === "development";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string;
    participantIds?: string[];
    callerDisplayName?: string;
  };
  const chatId = String(body.chatId ?? "").trim();
  const participantIds = Array.isArray(body.participantIds) ? body.participantIds.map((x) => String(x ?? "").trim()) : [];
  if (!chatId || participantIds.length < 2) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // Must include caller.
  if (!participantIds.includes(userId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsedChat = parseListingConversationId(chatId);
  if (!parsedChat) {
    if (isDev) console.warn("[calls/start] invalid chatId", { chatId });
    return NextResponse.json({ ok: false, error: "BAD_REQUEST", message: "invalid chatId" }, { status: 400 });
  }
  if (!isListingConversationParticipant(userId, chatId)) {
    if (isDev) console.warn("[calls/start] caller not in chat", { chatId, userId });
    return NextResponse.json({ ok: false, error: "FORBIDDEN", message: "not a chat participant" }, { status: 403 });
  }

  const allowedParticipantIds = new Set([parsedChat.ownerId, parsedChat.buyerId]);
  const uniqueParticipantIds = [...new Set(participantIds.filter(Boolean))];
  if (uniqueParticipantIds.length !== 2) {
    return NextResponse.json(
      { ok: false, error: "BAD_REQUEST", message: "participantIds must be owner and buyer" },
      { status: 400 },
    );
  }
  for (const pid of uniqueParticipantIds) {
    if (!allowedParticipantIds.has(pid)) {
      if (isDev) console.warn("[calls/start] participant not in chat", { chatId, pid });
      return NextResponse.json({ ok: false, error: "FORBIDDEN", message: "participant not in chat" }, { status: 403 });
    }
    if (pid !== userId) {
      const blockedForbidden = await chatUserBlockedForbidden(userId, pid);
      if (blockedForbidden) return blockedForbidden;
    }
  }
  const caller = await fetchStoredUserById(USERS_PATH, userId);
  if (!caller) {
    if (isDev) console.warn("[calls/start] caller not in users store", { userId });
    return NextResponse.json({ ok: false, error: "FORBIDDEN", message: "caller not found" }, { status: 403 });
  }

  // Reuse an existing non-expired pending/active call for this chat if caller is a participant.
  const existing = await findActiveOrPendingCall(chatId, userId);
  if (existing) {
    return NextResponse.json({
      ok: true,
      call: {
        callId: existing.callId,
        roomToken: existing.roomToken,
        status: existing.status,
        expiresAt: existing.expiresAt,
      },
    });
  }

  const callerDisplayName =
    typeof body.callerDisplayName === "string" ? body.callerDisplayName.trim().slice(0, 120) : "";

  try {
    const call = await createCall({
      chatId,
      callerId: userId,
      participantIds,
      ...(callerDisplayName ? { callerDisplayName } : {}),
    });

    return NextResponse.json({
      ok: true,
      call: { callId: call.callId, roomToken: call.roomToken, status: call.status, expiresAt: call.expiresAt },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isDev) {
      console.error("[calls/start] createCall failed", { chatId, userId, message });
    }
    return NextResponse.json({ ok: false, error: "CALL_CREATE_FAILED", message }, { status: 500 });
  }
}

