/**
 * Chat image uploads — shared limits for client preview and server enforcement.
 * Server remains authoritative (magic-byte MIME via file-type).
 */

export const CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const CHAT_UPLOAD_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const CHAT_UPLOAD_MIME_SET = new Set<string>(CHAT_UPLOAD_ALLOWED_MIME_TYPES);

export function chatUploadExtFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
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

const ALLOWED_NORMALIZED_EXTS = new Set(["jpg", "png", "webp"]);

export function isAllowedChatUploadExtension(ext: string): boolean {
  return ALLOWED_NORMALIZED_EXTS.has(normalizeChatUploadExt(ext));
}

export function validateChatUploadClient(file: File): { ok: true } | { ok: false; message: string } {
  const size = typeof file.size === "number" ? file.size : 0;
  if (!size || size > CHAT_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message: `Файл слишком большой (макс. ${CHAT_UPLOAD_MAX_BYTES / (1024 * 1024)}MB).`,
    };
  }
  const ext = normalizeChatUploadExt(chatUploadExtFromFileName(file.name));
  if (!ALLOWED_NORMALIZED_EXTS.has(ext)) {
    return { ok: false, message: "Недопустимый тип файла." };
  }
  const reported = (file.type ?? "").trim().toLowerCase();
  if (reported && !CHAT_UPLOAD_MIME_SET.has(reported)) {
    return { ok: false, message: "Недопустимый тип файла." };
  }
  return { ok: true };
}
