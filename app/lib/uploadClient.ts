"use client";

export type UploadFail = {
  kind: "upload";
  status?: number;
  serverError?: string;
  message: string;
};

export function isUploadFail(x: unknown): x is UploadFail {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.kind === "upload" && typeof o.message === "string";
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extOf(name: string) {
  const n = (name || "").toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx) : "";
}

export async function uploadFiles(files: File[]) {
  const urls: string[] = [];
  for (const file of files) {
    if (process.env.NODE_ENV !== "production") {
      console.log("UPLOAD FILE", { name: file.name, type: file.type, size: file.size });
    }

    const ext = extOf(file.name);
    if (ext && !ALLOWED_EXTS.has(ext)) {
      const err: UploadFail = {
        kind: "upload",
        message: "Фото не удалось загрузить. Проверьте формат и размер файла.",
      };
      throw err;
    }
    if (file.type && !ALLOWED_MIMES.has(file.type)) {
      const err: UploadFail = {
        kind: "upload",
        message: "Фото не удалось загрузить. Проверьте формат и размер файла.",
      };
      throw err;
    }
    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      const err: UploadFail = {
        kind: "upload",
        message: "Фото не удалось загрузить. Проверьте формат и размер файла.",
      };
      throw err;
    }

    const fd = new FormData();
    fd.append("file", file);

    const url = "/api/upload";
    if (process.env.NODE_ENV !== "production") {
      console.log("UPLOAD REQUEST", { url, uses: "FormData" });
    }

    const res = await fetch(url, { method: "POST", credentials: "include", cache: "no-store", body: fd });
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("UPLOAD RESPONSE", { status: res.status, body: json ?? text });
    }

    if (!res.ok) {
      const serverError =
        typeof (json as { error?: unknown } | null)?.error === "string" ? String((json as { error: string }).error) : undefined;
      const err: UploadFail = {
        kind: "upload",
        status: res.status,
        serverError,
        message: "Фото не удалось загрузить. Проверьте формат и размер файла.",
      };
      throw err;
    }

    const data = json as { url?: unknown } | null;
    const outUrl = typeof data?.url === "string" ? data.url : "";
    if (!outUrl) {
      const err: UploadFail = { kind: "upload", message: "Фото не удалось загрузить. Проверьте формат и размер файла." };
      throw err;
    }
    urls.push(outUrl);
  }
  return urls;
}

