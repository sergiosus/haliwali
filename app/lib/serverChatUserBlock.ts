import { NextResponse } from "next/server";
import { isChatBlockedBetweenUsers } from "./serverChatUserBlocksStore";

export async function chatUserBlockedForbidden(
  userId: string,
  peerUserId: string,
): Promise<NextResponse | null> {
  const blocked = await isChatBlockedBetweenUsers(userId, peerUserId);
  if (!blocked) return null;
  return NextResponse.json({ error: "USER_BLOCKED" }, { status: 403 });
}
