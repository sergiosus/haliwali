import type { ChatPrivateFileMetaWithStorage } from "./serverChatPrivateFiles";

export type ChatVoiceTranscriptionResult =
  | { ok: true; transcriptText: string }
  | { ok: false; code: "UNCONFIGURED" | "UPSTREAM" | "EMPTY"; message: string };

function logTranscriptionStage(stage: string, detail?: Record<string, string | number | boolean>) {
  if (detail) console.error("[chat-voice-transcription]", stage, detail);
  else console.error("[chat-voice-transcription]", stage);
}

export async function transcribeChatVoiceAudio(input: {
  audio: Buffer;
  meta: ChatPrivateFileMetaWithStorage;
}): Promise<ChatVoiceTranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    logTranscriptionStage("unconfigured");
    return {
      ok: false,
      code: "UNCONFIGURED",
      message: "Расшифровка временно недоступна. Обратитесь к администратору сайта.",
    };
  }

  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
  const filename = input.meta.originalName?.trim() || input.meta.storedName || `voice.${input.meta.ext}`;

  try {
    const form = new FormData();
    const audioBuffer = input.audio.buffer.slice(
      input.audio.byteOffset,
      input.audio.byteOffset + input.audio.byteLength,
    ) as ArrayBuffer;
    form.append("model", model);
    form.append("language", "ru");
    form.append("response_format", "json");
    form.append(
      "file",
      new Blob([audioBuffer], { type: input.meta.mime || "application/octet-stream" }),
      filename,
    );

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      logTranscriptionStage("openai_http_error", { status: res.status });
      return {
        ok: false,
        code: "UPSTREAM",
        message: "Не удалось расшифровать аудио. Попробуйте позже.",
      };
    }

    const data = (await res.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) {
      logTranscriptionStage("empty_response");
      return {
        ok: false,
        code: "EMPTY",
        message: "Не удалось распознать речь в этом аудио.",
      };
    }

    return { ok: true, transcriptText: text };
  } catch {
    logTranscriptionStage("request_failed");
    return {
      ok: false,
      code: "UPSTREAM",
      message: "Не удалось расшифровать аудио. Попробуйте позже.",
    };
  }
}
