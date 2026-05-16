/**
 * Chat image uploads — shared limits for client preview and server enforcement.
 * Server remains authoritative (magic-byte MIME via file-type).
 */

export const CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VOICE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_VOICE_MAX_DURATION_SEC = 120;

export const CHAT_UPLOAD_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CHAT_VOICE_ALLOWED_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"] as const;
export const CHAT_DOC_ALLOWED_MIME_TYPES = ["application/pdf"] as const;

export const CHAT_UPLOAD_MIME_SET = new Set<string>(CHAT_UPLOAD_ALLOWED_MIME_TYPES);
export const CHAT_VOICE_MIME_SET = new Set<string>(CHAT_VOICE_ALLOWED_MIME_TYPES);
export const CHAT_DOC_MIME_SET = new Set<string>(CHAT_DOC_ALLOWED_MIME_TYPES);

export type ChatUploadKind = "image" | "voice" | "document";

export function chatUploadExtFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/mp4") return "m4a";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "application/pdf") return "pdf";
  return "";
}

export function chatUploadExtFromFileName(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

/** Normalize extension: jpeg → jpg; lowercase. */
export function normalizeChatUploadExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpeg") return "jpg";
  return e;
}

const IMAGE_EXTS = new Set(["jpg", "png", "webp"]);
const VOICE_EXTS = new Set(["webm", "ogg", "m4a", "mp3"]);
const DOC_EXTS = new Set(["pdf"]);

export function isAllowedChatUploadExtension(ext: string, kind: ChatUploadKind = "image"): boolean {
  const e = normalizeChatUploadExt(ext);
  if (kind === "voice") return VOICE_EXTS.has(e);
  if (kind === "document") return DOC_EXTS.has(e);
  return IMAGE_EXTS.has(e);
}

export function validateChatUploadClient(
  file: File,
  kind: ChatUploadKind = "image",
): { ok: true } | { ok: false; message: string } {
  const size = typeof file.size === "number" ? file.size : 0;
  const maxBytes = kind === "voice" ? CHAT_VOICE_MAX_BYTES : CHAT_UPLOAD_MAX_BYTES;
  if (!size || size > maxBytes) {
    return {
      ok: false,
      message: `Файл слишком большой (макс. ${maxBytes / (1024 * 1024)}MB).`,
    };
  }
  const ext = normalizeChatUploadExt(chatUploadExtFromFileName(file.name));
  if (!isAllowedChatUploadExtension(ext, kind)) {
    return { ok: false, message: "Недопустимый тип файла." };
  }
  const reported = (file.type ?? "").trim().toLowerCase();
  const allowedSet =
    kind === "voice" ? CHAT_VOICE_MIME_SET : kind === "document" ? CHAT_DOC_MIME_SET : CHAT_UPLOAD_MIME_SET;
  if (reported && !allowedSet.has(reported)) {
    return { ok: false, message: "Недопустимый тип файла." };
  }
  return { ok: true };
}

export function isVoiceChatFileName(fileName: string | undefined | null): boolean {
  const n = (fileName ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.startsWith("voice.")) return true;
  const ext = normalizeChatUploadExt(chatUploadExtFromFileName(n));
  return VOICE_EXTS.has(ext);
}
