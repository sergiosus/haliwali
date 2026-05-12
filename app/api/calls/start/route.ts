import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { readUsersDb } from "../../../lib/serverUsersStore";
import { createCall, findActiveOrPendingCall } from "../../../lib/serverCallsStore";
import { chatUserBlockedForbidden } from "../../../lib/serverChatUserBlock";
import path from "node:path";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

function parseChatParticipantsFromChatId(chatId: string): string[] {
  const parts = chatId.split("::").map((x) => x.trim()).filter(Boolean);
  // expected: listingId::userA::userB (listingId can contain hyphens; user ids can contain hyphens)
  return parts.slice(1);
}

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

  // Verify the userId is a chat participant based on chatId structure (client chat id format).
  const chatParticipants = parseChatParticipantsFromChatId(chatId);
  if (chatParticipants.length >= 2 && !chatParticipants.includes(userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Verify all participants exist as server users (prevents arbitrary ids).
  const usersDb = await readUsersDb(USERS_PATH);
  for (const pid of participantIds) {
    if (!pid) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    if (!usersDb.usersById[pid]) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    if (pid !== userId) {
      const blockedForbidden = await chatUserBlockedForbidden(userId, pid);
      if (blockedForbidden) return blockedForbidden;
    }
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
}

