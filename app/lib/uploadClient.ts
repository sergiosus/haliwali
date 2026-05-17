"use client";

import {
  LISTING_PHOTO_ALLOWED_EXTS,
  LISTING_PHOTO_ALLOWED_MIMES,
  LISTING_PHOTO_MAX_BYTES,
} from "./listingPhotoLimits";
import {
  ListingPhotoPrepareError,
  prepareListingPhotoFileForUpload,
} from "./uploadImagePrepare";

export type UploadFailReason =
  | "network_error"
  | "server_status"
  | "file_too_large"
  | "unsupported_type"
  | "timeout_or_abort"
  | "bad_response";

export type UploadFail = {
  kind: "upload";
  /** Safe machine-readable category for diagnostics (never shown as raw stack to users). */
  reason?: UploadFailReason;
  status?: number;
  serverError?: string;
  message: string;
};

export function isUploadFail(x: unknown): x is UploadFail {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.kind === "upload" && typeof o.message === "string";
}

const ALLOWED_MIMES = new Set<string>(LISTING_PHOTO_ALLOWED_MIMES);
const ALLOWED_EXTS = new Set<string>(LISTING_PHOTO_ALLOWED_EXTS);

/** Default user-facing copy for opaque network / transport failures. */
const USER_MSG_UPLOAD_GENERIC =
  "Не удалось загрузить фото. Проверьте интернет или попробуйте фото меньшего размера.";

/** Per-file upload timeout (mobile networks / large bodies). */
const UPLOAD_FETCH_TIMEOUT_MS = 120_000;

function extOf(name: string) {
  const n = (name || "").toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx) : "";
}

function devUploadWarn(reason: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[uploadClient]", reason, detail);
  }
}

function throwUploadFail(reason: UploadFailReason, message: string, extra?: Partial<UploadFail>): never {
  const err: UploadFail = { kind: "upload", reason, message, ...extra };
  devUploadWarn("upload_fail", { reason, message, ...extra });
  throw err;
}

export async function uploadFiles(files: File[]) {
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;

    if (process.env.NODE_ENV !== "production") {
      console.log("[uploadClient] file", { index: i, name: file.name, type: file.type, size: file.size });
    }

    const ext = extOf(file.name);
    if (ext && !ALLOWED_EXTS.has(ext)) {
      throwUploadFail("unsupported_type", "Фото не удалось загрузить. Проверьте формат и размер файла.");
    }

    let prepared: File;
    try {
      prepared = await prepareListingPhotoFileForUpload(file);
    } catch (e) {
      if (e instanceof ListingPhotoPrepareError) {
        throwUploadFail(
          e.code === "unsupported_type" ? "unsupported_type" : "file_too_large",
          e.message,
        );
      }
      devUploadWarn("prepare_failed", { index: i, error: String(e) });
      if (file.size > LISTING_PHOTO_MAX_BYTES) {
        throwUploadFail(
          "file_too_large",
          "Файл больше 5 МБ. Выберите фото меньшего размера или сожмите его перед загрузкой.",
        );
      }
      prepared = file;
    }

    const mime = (prepared.type || file.type || "").trim().toLowerCase();
    if (mime && !ALLOWED_MIMES.has(mime)) {
      throwUploadFail("unsupported_type", "Фото не удалось загрузить. Проверьте формат и размер файла.");
    }
    if (!mime) {
      const extP = extOf(prepared.name);
      if (extP && !ALLOWED_EXTS.has(extP)) {
        throwUploadFail("unsupported_type", "Фото не удалось загрузить. Проверьте формат и размер файла.");
      }
    }

    if (!prepared.size) {
      throwUploadFail("unsupported_type", "Фото не удалось загрузить. Проверьте формат и размер файла.");
    }
    if (prepared.size > LISTING_PHOTO_MAX_BYTES) {
      throwUploadFail(
        "file_too_large",
        "Файл больше 5 МБ даже после сжатия. Выберите другое фото или уменьшите его в галерее.",
      );
    }

    const fd = new FormData();
    fd.append("file", prepared);

    const url = "/api/upload";
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), UPLOAD_FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: fd,
        signal: controller.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const aborted = isAbort || /abort/i.test(message);

      if (process.env.NODE_ENV === "production") {
        console.error("[uploadClient] fetch_failed", { index: i, aborted });
      } else {
        console.error("[uploadClient] fetch_failed", {
          index: i,
          fileName: prepared.name,
          fileSize: prepared.size,
          aborted,
          error: err,
        });
      }

      if (aborted) {
        throwUploadFail(
          "timeout_or_abort",
          "Превышено время ожидания при загрузке фото. Проверьте интернет и попробуйте снова.",
        );
      }
      throwUploadFail("network_error", USER_MSG_UPLOAD_GENERIC);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[uploadClient] response", { index: i, status: res.status, body: json ?? text });
    }

    if (!res.ok) {
      if (process.env.NODE_ENV === "production") {
        console.error("[uploadClient] http_error", { status: res.status, index: i });
      } else {
        console.error("[uploadClient] http_error", {
          status: res.status,
          index: i,
          bodyPreview: text.slice(0, 400),
        });
      }
      const serverError =
        typeof (json as { error?: unknown } | null)?.error === "string" ? String((json as { error: string }).error) : undefined;
      if (res.status === 413) {
        throwUploadFail("file_too_large", "Файл слишком большой для загрузки (максимум 5 МБ на фото).", {
          status: res.status,
          serverError,
        });
      }
      if (res.status === 415) {
        throwUploadFail("unsupported_type", "Фото не удалось загрузить. Проверьте формат и размер файла.", {
          status: res.status,
          serverError,
        });
      }
      throwUploadFail("server_status", USER_MSG_UPLOAD_GENERIC, { status: res.status, serverError });
    }

    const data = json as { url?: unknown } | null;
    const outUrl = typeof data?.url === "string" ? data.url : "";
    if (!outUrl) {
      throwUploadFail("bad_response", USER_MSG_UPLOAD_GENERIC);
    }
    urls.push(outUrl);
  }
  return urls;
}
