import { NextResponse } from "next/server";
import { publicChatMessageSenderLabel } from "../../../../lib/serverChatParticipantLabel";
import { getCompanyConversation, isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getListingConversation, isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";
import { isAdminAuthed } from "../../../../lib/serverAdminSession";
import { extractChatAiTasks, type ChatTaskExtractionMessage } from "../../../../lib/serverChatAiTasks";
import { listChatAiTasks, normalizeAiTaskDraft, saveChatAiTasks } from "../../../../lib/serverChatAiTasksStore";
import { listChatVoiceTranscripts } from "../../../../lib/serverChatVoiceTranscripts";

export const runtime = "nodejs";

async function authorize(chatId: string): Promise<{ ok: true; userId: string; isAdmin: boolean } | { ok: false; status: number; error: string }> {
  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  const admin = await isAdminAuthed();
  if (!userId && !admin) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  if (!chatId.trim()) return { ok: false, status: 400, error: "BAD_REQUEST" };
  if (admin) return { ok: true, userId: userId || "admin", isAdmin: true };

  const allowed =
    chatId.startsWith("company:")
      ? isCompanyConversationParticipant(userId, chatId)
      : isListingConversationParticipant(userId, chatId);
  if (!allowed) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  return { ok: true, userId, isAdmin: false };
}

async function loadMessages(chatId: string): Promise<ChatTaskExtractionMessage[]> {
  const conv = chatId.startsWith("company:")
    ? await getCompanyConversation(chatId)
    : await getListingConversation(chatId);
  if (!conv) return [];
  return conv.messages
    .filter((m) => (m.type ?? "text") === "text" && m.text.trim())
    .slice(-40)
    .map((m) => ({
      id: m.id,
      senderLabel: publicChatMessageSenderLabel(m.senderId, m.senderName),
      createdAt: m.createdAt,
      text: m.text.trim(),
    }));
}

async function loadDoneTranscripts(chatId: string) {
  try {
    const rows = await listChatVoiceTranscripts(chatId);
    return rows
      .filter((row) => row.status === "done" && row.transcriptText.trim())
      .slice(-12)
      .map((row) => ({ messageId: row.messageId, text: row.transcriptText.trim() }));
  } catch {
    return [];
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorize(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const tasks = await listChatAiTasks(chatId, auth.userId);
    return NextResponse.json({ ok: true, tasks });
  } catch {
    return NextResponse.json(
      { error: "STORAGE_UNAVAILABLE", message: "Хранилище задач недоступно." },
      { status: 503 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorize(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { save?: boolean; tasks?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.save === true) {
    const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
    const tasks = rawTasks.map(normalizeAiTaskDraft).filter((x): x is NonNullable<ReturnType<typeof normalizeAiTaskDraft>> => Boolean(x));
    if (tasks.length === 0) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    try {
      const saved = await saveChatAiTasks({ conversationId: chatId, userId: auth.userId, tasks });
      return NextResponse.json({ ok: true, saved: true, tasks: saved });
    } catch {
      return NextResponse.json(
        { error: "STORAGE_UNAVAILABLE", message: "Не удалось сохранить задачи." },
        { status: 503 },
      );
    }
  }

  const [messages, transcripts] = await Promise.all([
    loadMessages(chatId),
    loadDoneTranscripts(chatId),
  ]);
  const result = await extractChatAiTasks({ messages, transcripts });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message, tasks: [] },
      { status: result.code === "UNCONFIGURED" ? 503 : 502 },
    );
  }
  return NextResponse.json({ ok: true, tasks: result.tasks });
}
