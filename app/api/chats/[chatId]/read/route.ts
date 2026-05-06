import { NextResponse } from "next/server";
import { isListingConversationParticipant, markListingConversationRead } from "../../../../lib/serverListingChatsStore";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  if (!chatId || !isListingConversationParticipant(uid, chatId)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const n = await markListingConversationRead(chatId, uid);
  return NextResponse.json({ ok: true, marked: n });
}
