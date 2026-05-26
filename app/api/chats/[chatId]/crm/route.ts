import { NextResponse } from "next/server";
import { getChatCrmRecord, upsertChatCrmRecord } from "../../../../lib/serverChatCrmStore";
import { isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import { isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

async function authorize(chatId: string): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!userId) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  if (!chatId.trim()) return { ok: false, status: 400, error: "BAD_REQUEST" };

  const allowed =
    chatId.startsWith("company:")
      ? isCompanyConversationParticipant(userId, chatId)
      : isListingConversationParticipant(userId, chatId);
  if (!allowed) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  return { ok: true, userId };
}

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorize(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const crm = await getChatCrmRecord(chatId, auth.userId);
  return NextResponse.json({ ok: true, crm });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorize(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { status?: unknown; privateNote?: unknown; tags?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const crm = await upsertChatCrmRecord(chatId, auth.userId, {
    status: body.status,
    privateNote: body.privateNote,
    tags: body.tags,
  });
  return NextResponse.json({ ok: true, crm });
}
