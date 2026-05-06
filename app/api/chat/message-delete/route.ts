import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { applyMessageDeletion } from "../../../lib/serverChatMessageStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string;
    messageId?: string;
    scope?: string;
  };
  const chatId = String(body.chatId ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();
  const scopeRaw = String(body.scope ?? "").trim();

  const scope = scopeRaw === "everyone" || scopeRaw === "me" ? scopeRaw : "";

  if (!chatId || !messageId || !scope) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const res = await applyMessageDeletion({
    chatId,
    messageId,
    actorUserId: userId,
    scope,
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
