import { NextResponse } from "next/server";
import { isUserModerationBlocked } from "./serverModerationBlockedStore";

/** Blocks listing create/update for users flagged in `.data/admin-user-blocks.json`. */
export async function moderationBlockedForbidden(userId: string): Promise<NextResponse | null> {
  const id = (userId ?? "").trim();
  if (!id) return null;
  const blocked = await isUserModerationBlocked(id);
  if (!blocked) return null;
  return NextResponse.json(
    {
      error: "MODERATION_BLOCKED",
      message: "Действие недоступно по решению поддержки.",
    },
    { status: 403 },
  );
}
