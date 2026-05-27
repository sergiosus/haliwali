import { NextResponse } from "next/server";
import { normalizeChatAiCrmSummaryJson } from "../../../../lib/chatAiCrmSummary";
import { loadChatAiConversation } from "../../../../lib/serverChatAiConversation";
import { generateChatAiSummary } from "../../../../lib/serverChatAiSummary";
import {
  getLatestChatAiSummaryForUser,
  saveChatAiSummary,
} from "../../../../lib/serverChatAiSummaryStore";
import { isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import { isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

export const runtime = "nodejs";

async function authorizeChat(
  chatId: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!userId) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  if (!chatId) return { ok: false, status: 400, error: "BAD_REQUEST" };

  const isCompany = chatId.startsWith("company:");
  const allowed = isCompany
    ? isCompanyConversationParticipant(userId, chatId)
    : isListingConversationParticipant(userId, chatId);
  if (!allowed) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  return { ok: true, userId };
}

function savedPayload(record: NonNullable<Awaited<ReturnType<typeof getLatestChatAiSummaryForUser>>>) {
  return {
    structured: record.summaryJson,
    summary: record.summaryText,
    updatedAt: record.updatedAt,
    fromSaved: true as const,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorizeChat(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const saved = await getLatestChatAiSummaryForUser(chatId, auth.userId);
  if (!saved) {
    return NextResponse.json({ ok: true, saved: null });
  }
  return NextResponse.json({ ok: true, saved: savedPayload(saved) });
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorizeChat(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { save?: boolean; summaryText?: string; structured?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.save === true) {
    const summaryText = typeof body.summaryText === "string" ? body.summaryText.trim() : "";
    const structured =
      body.structured && typeof body.structured === "object"
        ? normalizeChatAiCrmSummaryJson(body.structured)
        : undefined;
    if (!summaryText && !structured) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const saved = await saveChatAiSummary({
      conversationId: chatId,
      userId: auth.userId,
      summaryText,
      summaryJson: structured,
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: "STORAGE_UNAVAILABLE", message: "Не удалось сохранить итог." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, saved: true, id: saved.id });
  }

  const previous = await getLatestChatAiSummaryForUser(chatId, auth.userId);

  const bundle = await loadChatAiConversation(chatId);
  const messages = bundle?.messages ?? [];
  const result = await generateChatAiSummary(messages);

  if (!result.ok) {
    if (previous) {
      console.error("[CHAT_AI]", "fallback_saved", { code: result.code });
      return NextResponse.json({
        ok: false,
        code: result.code,
        message: result.message,
        ...savedPayload(previous),
      });
    }
    const status = result.code === "UNCONFIGURED" ? 503 : result.code === "UPSTREAM" ? 502 : 200;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
      },
      { status },
    );
  }

  const persist = await saveChatAiSummary({
    conversationId: chatId,
    userId: auth.userId,
    summaryText: result.summary,
    summaryJson: result.structured,
  });
  if (!persist.ok) {
    console.error("[CHAT_AI_ERROR]", "auto_save_failed", { hasChatId: Boolean(chatId) });
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    structured: result.structured,
    fromSaved: false,
    persisted: persist.ok,
  });
}
