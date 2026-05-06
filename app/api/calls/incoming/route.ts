import path from "node:path";
import { NextResponse } from "next/server";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { findIncomingPendingForUser } from "../../../lib/serverCallsStore";
import { readUsersDb } from "../../../lib/serverUsersStore";
import { getSafePublicName } from "@/lib/utils/getSafePublicName";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET() {
  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const call = await findIncomingPendingForUser(userId);
  if (!call) {
    return NextResponse.json({ ok: true, call: null });
  }

  let callerName = (call.callerDisplayName ?? "").trim();
  if (!callerName) {
    const db = await readUsersDb(USERS_PATH);
    const caller = db.usersById[call.callerId];
    callerName = caller
      ? getSafePublicName({
          userId: call.callerId,
          name: caller.name,
          displayName: caller.displayName,
        })
      : getSafePublicName({ userId: call.callerId });
  }

  return NextResponse.json({
    ok: true,
    call: {
      callId: call.callId,
      callerId: call.callerId,
      callerName,
      chatId: call.chatId,
    },
  });
}
