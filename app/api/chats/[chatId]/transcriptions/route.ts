import { NextResponse } from "next/server";
import { CHAT_VOICE_MIME_SET, isVoiceChatFileName } from "../../../../lib/chatUploadConstraints";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getCompanyConversation, isCompanyConversationParticipant } from "../../../../lib/serverCompanyChatsStore";
import {
  parsePrivateChatFileIdFromMessageUrl,
  readChatPrivateFileMetaWithStorage,
} from "../../../../lib/serverChatPrivateFiles";
import { getListingConversation, isListingConversationParticipant } from "../../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";
import {
  type ChatVoiceTranscriptRecord,
  getChatVoiceTranscript,
  listChatVoiceTranscripts,
  readPrivateAudioForTranscription,
  upsertChatVoiceTranscript,
} from "../../../../lib/serverChatVoiceTranscripts";
import { transcribeChatVoiceAudio } from "../../../../lib/serverChatVoiceTranscriptionService";

export const runtime = "nodejs";

type VoiceMessage = {
  id: string;
  fileUrl?: string;
  fileName?: string;
  type?: string;
};

function transcriptToApi(row: ChatVoiceTranscriptRecord) {
  return {
    messageId: row.messageId,
    status: row.status,
    transcriptText: row.transcriptText,
    errorCode: row.errorCode,
    updatedAt: row.updatedAt,
  };
}

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

async function getMessageForTranscription(chatId: string, messageId: string): Promise<VoiceMessage | null> {
  if (chatId.startsWith("company:")) {
    const conv = await getCompanyConversation(chatId);
    const msg = conv?.messages.find((m) => m.id === messageId);
    return msg ? { id: msg.id, type: msg.type, fileUrl: msg.fileUrl, fileName: msg.fileName } : null;
  }
  const conv = await getListingConversation(chatId);
  const msg = conv?.messages.find((m) => m.id === messageId);
  return msg ? { id: msg.id, type: msg.type, fileUrl: msg.fileUrl, fileName: msg.fileName } : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId: raw } = await ctx.params;
  const chatId = decodeURIComponent((raw ?? "").trim());
  const auth = await authorize(chatId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await listChatVoiceTranscripts(chatId);
    return NextResponse.json({ ok: true, transcripts: rows.map(transcriptToApi) });
  } catch {
    return NextResponse.json(
      { error: "STORAGE_UNAVAILABLE", message: "Хранилище расшифровок недоступно." },
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

  let body: { messageId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const messageId = (body.messageId ?? "").trim();
  if (!messageId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const existing = await getChatVoiceTranscript(chatId, messageId).catch(() => null);
  if (existing?.status === "done" && existing.transcriptText.trim()) {
    return NextResponse.json({ ok: true, transcript: transcriptToApi(existing) });
  }

  const msg = await getMessageForTranscription(chatId, messageId);
  if (!msg || msg.type !== "file" || !msg.fileUrl) {
    return NextResponse.json(
      { error: "UNSUPPORTED_FILE", message: "Это сообщение не содержит аудиофайл." },
      { status: 415 },
    );
  }
  if (!isVoiceChatFileName(msg.fileName)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_FILE", message: "Этот тип файла не поддерживает расшифровку." },
      { status: 415 },
    );
  }

  const fileId = parsePrivateChatFileIdFromMessageUrl(msg.fileUrl);
  if (!fileId) {
    return NextResponse.json(
      { error: "UNSUPPORTED_FILE", message: "Расшифровка доступна только для приватных аудиофайлов чата." },
      { status: 415 },
    );
  }

  const meta = await readChatPrivateFileMetaWithStorage(fileId);
  if (!meta || meta.chatId !== chatId || !CHAT_VOICE_MIME_SET.has(meta.mime)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_FILE", message: "Этот аудиоформат не поддерживается." },
      { status: 415 },
    );
  }

  try {
    await upsertChatVoiceTranscript({
      conversationId: chatId,
      messageId,
      status: "processing",
      requestedBy: auth.userId,
    });
  } catch {
    return NextResponse.json(
      { error: "STORAGE_UNAVAILABLE", message: "Хранилище расшифровок недоступно." },
      { status: 503 },
    );
  }

  let audio: Buffer;
  try {
    audio = await readPrivateAudioForTranscription(meta.storagePath);
  } catch {
    const failed = await upsertChatVoiceTranscript({
      conversationId: chatId,
      messageId,
      status: "failed",
      errorCode: "FILE_READ_FAILED",
      requestedBy: auth.userId,
    });
    return NextResponse.json(
      { ok: false, message: "Не удалось прочитать аудиофайл.", transcript: transcriptToApi(failed) },
      { status: 404 },
    );
  }
  const result = await transcribeChatVoiceAudio({ audio, meta });
  if (!result.ok) {
    const failed = await upsertChatVoiceTranscript({
      conversationId: chatId,
      messageId,
      status: "failed",
      errorCode: result.code,
      requestedBy: auth.userId,
    });
    return NextResponse.json(
      { ok: false, message: result.message, transcript: transcriptToApi(failed) },
      { status: result.code === "UNCONFIGURED" ? 503 : 502 },
    );
  }

  const done = await upsertChatVoiceTranscript({
    conversationId: chatId,
    messageId,
    status: "done",
    transcriptText: result.transcriptText,
    requestedBy: auth.userId,
  });
  return NextResponse.json({ ok: true, transcript: transcriptToApi(done) });
}
