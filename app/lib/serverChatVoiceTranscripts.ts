import { readFile } from "node:fs/promises";
import { getPool, usesPostgres } from "./pgPool";

export type ChatVoiceTranscriptStatus = "processing" | "done" | "failed";

export type ChatVoiceTranscriptRecord = {
  conversationId: string;
  messageId: string;
  status: ChatVoiceTranscriptStatus;
  transcriptText: string;
  errorCode: string;
  requestedBy: string;
  createdAt: number;
  updatedAt: number;
};

export function normalizeChatVoiceTranscriptStatus(raw: unknown): ChatVoiceTranscriptStatus {
  return raw === "processing" || raw === "done" || raw === "failed" ? raw : "failed";
}

function rowToRecord(row: {
  conversation_id: string;
  message_id: string;
  status: string;
  transcript_text: string | null;
  error_code: string | null;
  requested_by: string;
  created_at: string | number;
  updated_at: string | number;
}): ChatVoiceTranscriptRecord {
  return {
    conversationId: row.conversation_id,
    messageId: row.message_id,
    status: normalizeChatVoiceTranscriptStatus(row.status),
    transcriptText: row.transcript_text ?? "",
    errorCode: row.error_code ?? "",
    requestedBy: row.requested_by,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

function requirePostgres(): void {
  if (!usesPostgres()) {
    throw new Error("CHAT_VOICE_TRANSCRIPTS_REQUIRE_POSTGRES");
  }
}

export async function listChatVoiceTranscripts(conversationIdRaw: string): Promise<ChatVoiceTranscriptRecord[]> {
  requirePostgres();
  const conversationId = conversationIdRaw.trim();
  if (!conversationId) return [];

  const { rows } = await getPool().query<Parameters<typeof rowToRecord>[0]>(
    `SELECT conversation_id, message_id, status, transcript_text, error_code, requested_by, created_at, updated_at
     FROM chat_voice_transcripts
     WHERE conversation_id = $1
     ORDER BY updated_at ASC`,
    [conversationId],
  );
  return rows.map(rowToRecord);
}

export async function getChatVoiceTranscript(
  conversationIdRaw: string,
  messageIdRaw: string,
): Promise<ChatVoiceTranscriptRecord | null> {
  requirePostgres();
  const conversationId = conversationIdRaw.trim();
  const messageId = messageIdRaw.trim();
  if (!conversationId || !messageId) return null;

  const { rows } = await getPool().query<Parameters<typeof rowToRecord>[0]>(
    `SELECT conversation_id, message_id, status, transcript_text, error_code, requested_by, created_at, updated_at
     FROM chat_voice_transcripts
     WHERE conversation_id = $1 AND message_id = $2
     LIMIT 1`,
    [conversationId, messageId],
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function upsertChatVoiceTranscript(input: {
  conversationId: string;
  messageId: string;
  status: ChatVoiceTranscriptStatus;
  transcriptText?: string;
  errorCode?: string;
  requestedBy: string;
}): Promise<ChatVoiceTranscriptRecord> {
  requirePostgres();
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  const requestedBy = input.requestedBy.trim();
  const now = Date.now();
  const transcriptText = (input.transcriptText ?? "").trim().slice(0, 20_000);
  const errorCode = (input.errorCode ?? "").trim().slice(0, 80);

  const { rows } = await getPool().query<Parameters<typeof rowToRecord>[0]>(
    `INSERT INTO chat_voice_transcripts (
       conversation_id, message_id, status, transcript_text, error_code, requested_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (conversation_id, message_id)
     DO UPDATE SET status = EXCLUDED.status,
                   transcript_text = EXCLUDED.transcript_text,
                   error_code = EXCLUDED.error_code,
                   requested_by = EXCLUDED.requested_by,
                   updated_at = EXCLUDED.updated_at
     RETURNING conversation_id, message_id, status, transcript_text, error_code, requested_by, created_at, updated_at`,
    [conversationId, messageId, input.status, transcriptText, errorCode, requestedBy, now],
  );
  return rowToRecord(rows[0]!);
}

export async function readPrivateAudioForTranscription(storagePath: string): Promise<Buffer> {
  return readFile(storagePath);
}
