import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import { getPool, usesPostgres } from "./pgPool";

/** Chat attachments — not under `public/`; served only via `/api/files/[id]` + session + participant check. */
export const CHAT_PRIVATE_UPLOADS_ROOT = path.join(process.cwd(), "uploads_private");
const CHAT_OBJECTS_DIR = path.join(CHAT_PRIVATE_UPLOADS_ROOT, "chat");
const META_DIR = path.join(CHAT_PRIVATE_UPLOADS_ROOT, "meta");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChatPrivateFileMeta = {
  chatId: string;
  uploadedBy: string;
  ext: string;
  mime: string;
  createdAt: number;
};

export type ChatPrivateFileMetaWithStorage = ChatPrivateFileMeta & {
  storagePath: string;
  storedName: string;
  originalName?: string;
  sizeBytes?: number;
};

export function isChatPrivateFileId(id: string): boolean {
  return UUID_RE.test((id ?? "").trim());
}

function metaPath(fileId: string): string {
  return path.join(META_DIR, `${fileId}.json`);
}

function objectPath(fileId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return path.join(CHAT_OBJECTS_DIR, `${fileId}.${safeExt}`);
}

export async function savePrivateChatFile(opts: {
  buffer: Buffer;
  chatId: string;
  uploadedBy: string;
  ext: string;
  mime: string;
  fileId: string;
  originalName?: string;
  sizeBytes?: number;
}): Promise<void> {
  const cid = opts.chatId.trim();
  const uid = opts.uploadedBy.trim();
  const id = opts.fileId.trim();
  if (!cid || !uid || !isChatPrivateFileId(id)) throw new Error("BAD_INPUT");
  const ext = opts.ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  if (!ext) throw new Error("BAD_EXT");

  await mkdir(CHAT_OBJECTS_DIR, { recursive: true });

  const meta: ChatPrivateFileMeta = {
    chatId: cid,
    uploadedBy: uid,
    ext,
    mime: opts.mime,
    createdAt: Date.now(),
  };

  const absFile = objectPath(id, ext);
  const storedName = path.basename(absFile);

  await writeFile(absFile, opts.buffer);

  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO chat_private_files (
        file_id, chat_id, uploaded_by, original_name, stored_name, ext, mime, size_bytes, storage_path, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (file_id) DO UPDATE SET
        chat_id = EXCLUDED.chat_id,
        uploaded_by = EXCLUDED.uploaded_by,
        original_name = EXCLUDED.original_name,
        stored_name = EXCLUDED.stored_name,
        ext = EXCLUDED.ext,
        mime = EXCLUDED.mime,
        size_bytes = EXCLUDED.size_bytes,
        storage_path = EXCLUDED.storage_path,
        created_at = EXCLUDED.created_at`,
      [
        id,
        cid,
        uid,
        (opts.originalName ?? "").trim() || null,
        storedName,
        ext,
        opts.mime,
        typeof opts.sizeBytes === "number" && Number.isFinite(opts.sizeBytes) ? Math.max(0, Math.floor(opts.sizeBytes)) : null,
        path.resolve(absFile),
        meta.createdAt,
      ],
    );
    return;
  }

  // Dev-only JSON fallback for metadata.
  assertFileStoreNotUsedInProduction("serverChatPrivateFiles.savePrivateChatFile.meta-json", { kind: "meta-json" });
  await mkdir(META_DIR, { recursive: true });
  const absMeta = metaPath(id);
  await writeFile(absMeta, JSON.stringify(meta, null, 2), "utf8");
}

export async function readChatPrivateFileMeta(fileId: string): Promise<ChatPrivateFileMeta | null> {
  const id = fileId.trim();
  if (!isChatPrivateFileId(id)) return null;
  if (usesPostgres()) {
    await migrateLegacyChatPrivateMetaJsonToPgIfNeeded();
    const { rows } = await getPool().query<{
      chat_id: string;
      uploaded_by: string;
      ext: string;
      mime: string;
      created_at: number;
    }>(
      `SELECT chat_id, uploaded_by, ext, mime, created_at
       FROM chat_private_files
       WHERE file_id = $1
       LIMIT 1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const chatId = String(r.chat_id ?? "").trim();
    const uploadedBy = String(r.uploaded_by ?? "").trim();
    const ext = String(r.ext ?? "").trim().toLowerCase();
    const mime = String(r.mime ?? "").trim();
    const createdAt = Number(r.created_at);
    if (!chatId || !uploadedBy || !ext) return null;
    return { chatId, uploadedBy, ext, mime: mime || "application/octet-stream", createdAt };
  }

  assertFileStoreNotUsedInProduction("serverChatPrivateFiles.readChatPrivateFileMeta", { kind: "meta-json" });
  try {
    const raw = await readFile(metaPath(id), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const chatId = typeof o.chatId === "string" ? o.chatId.trim() : "";
    const uploadedBy = typeof o.uploadedBy === "string" ? o.uploadedBy.trim() : "";
    const ext = typeof o.ext === "string" ? o.ext.trim().toLowerCase() : "";
    const mime = typeof o.mime === "string" ? o.mime.trim() : "";
    const createdAt = typeof o.createdAt === "number" ? o.createdAt : 0;
    if (!chatId || !uploadedBy || !ext) return null;
    return { chatId, uploadedBy, ext, mime: mime || "application/octet-stream", createdAt };
  } catch {
    return null;
  }
}

let migratedLegacyMetaJson = false;

export async function migrateLegacyChatPrivateMetaJsonToPgIfNeeded(): Promise<void> {
  if (!usesPostgres()) return;
  if (migratedLegacyMetaJson) return;
  migratedLegacyMetaJson = true;

  // Best-effort: only migrate metadata files present on disk.
  // (Binary objects remain on disk; we only record their resolved path.)
  let entries: string[] = [];
  try {
    const fs = await import("node:fs/promises");
    entries = await fs.readdir(META_DIR);
  } catch {
    return;
  }

  const pool = getPool();
  for (const name of entries) {
    const m = /^([0-9a-f-]{36})\.json$/i.exec(name);
    if (!m) continue;
    const fileId = m[1] ?? "";
    if (!isChatPrivateFileId(fileId)) continue;
    try {
      const raw = await readFile(metaPath(fileId), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const o = parsed as Record<string, unknown>;
      const chatId = typeof o.chatId === "string" ? o.chatId.trim() : "";
      const uploadedBy = typeof o.uploadedBy === "string" ? o.uploadedBy.trim() : "";
      const ext = typeof o.ext === "string" ? o.ext.trim().toLowerCase() : "";
      const mime = typeof o.mime === "string" ? o.mime.trim() : "";
      const createdAt = typeof o.createdAt === "number" ? o.createdAt : 0;
      if (!chatId || !uploadedBy || !ext || !createdAt) continue;
      const absFile = objectPath(fileId, ext);
      const storedName = path.basename(absFile);
      await pool.query(
        `INSERT INTO chat_private_files (
          file_id, chat_id, uploaded_by, original_name, stored_name, ext, mime, size_bytes, storage_path, created_at
        ) VALUES ($1,$2,$3,NULL,$4,$5,$6,NULL,$7,$8)
        ON CONFLICT (file_id) DO NOTHING`,
        [fileId, chatId, uploadedBy, storedName, ext, mime || "application/octet-stream", path.resolve(absFile), createdAt],
      );
    } catch {
      // ignore invalid files
    }
  }
}

export async function readChatPrivateFileMetaWithStorage(fileId: string): Promise<ChatPrivateFileMetaWithStorage | null> {
  const id = fileId.trim();
  if (!isChatPrivateFileId(id)) return null;
  if (usesPostgres()) {
    await migrateLegacyChatPrivateMetaJsonToPgIfNeeded();
    const { rows } = await getPool().query<{
      chat_id: string;
      uploaded_by: string;
      ext: string;
      mime: string;
      created_at: number;
      storage_path: string;
      stored_name: string;
      original_name: string | null;
      size_bytes: string | number | null;
    }>(
      `SELECT chat_id, uploaded_by, ext, mime, created_at, storage_path, stored_name, original_name, size_bytes
       FROM chat_private_files
       WHERE file_id = $1
       LIMIT 1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const chatId = String(r.chat_id ?? "").trim();
    const uploadedBy = String(r.uploaded_by ?? "").trim();
    const ext = String(r.ext ?? "").trim().toLowerCase();
    const mime = String(r.mime ?? "").trim();
    const createdAt = Number(r.created_at);
    const storagePath = String(r.storage_path ?? "").trim();
    const storedName = String(r.stored_name ?? "").trim();
    const originalName = (r.original_name ?? "").trim();
    const sizeBytesNum = r.size_bytes === null || r.size_bytes === undefined ? NaN : Number(r.size_bytes);
    if (!chatId || !uploadedBy || !ext || !storagePath || !storedName) return null;
    return {
      chatId,
      uploadedBy,
      ext,
      mime: mime || "application/octet-stream",
      createdAt,
      storagePath,
      storedName,
      ...(originalName ? { originalName } : {}),
      ...(Number.isFinite(sizeBytesNum) ? { sizeBytes: sizeBytesNum } : {}),
    };
  }

  assertFileStoreNotUsedInProduction("serverChatPrivateFiles.readChatPrivateFileMetaWithStorage", { kind: "meta-json" });
  const base = await readChatPrivateFileMeta(id);
  if (!base) return null;
  const absFile = objectPath(id, base.ext);
  return { ...base, storagePath: path.resolve(absFile), storedName: path.basename(absFile) };
}

/** Resolved absolute path for the object file (only after meta validated). */
export function absolutePathForPrivateChatObject(fileId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return path.resolve(objectPath(fileId.trim(), safeExt));
}

/** Prefix stored in `file_url` / `fileUrl` for private chat blobs. */
export const CHAT_PRIVATE_FILE_URL_PREFIX = "/api/files/";

export function privateChatFileApiUrl(fileId: string): string {
  return `${CHAT_PRIVATE_FILE_URL_PREFIX}${fileId}`;
}

export function parsePrivateChatFileIdFromMessageUrl(fileUrl: string): string | null {
  const u = (fileUrl ?? "").trim();
  if (!u.startsWith(CHAT_PRIVATE_FILE_URL_PREFIX)) return null;
  const id = u.slice(CHAT_PRIVATE_FILE_URL_PREFIX.length).split(/[?#]/)[0]?.trim() ?? "";
  return isChatPrivateFileId(id) ? id : null;
}

/** Legacy `/uploads/…` URLs skip this check. Private `/api/files/:id` must match conversation + uploader. */
export async function isPrivateChatFileUrlAllowedInMessage(
  fileUrl: string,
  conversationId: string,
  senderId: string,
): Promise<boolean> {
  const id = parsePrivateChatFileIdFromMessageUrl(fileUrl);
  if (!id) return true;
  const meta = await readChatPrivateFileMeta(id);
  const cid = conversationId.trim();
  const sid = senderId.trim();
  return Boolean(meta && meta.chatId === cid && meta.uploadedBy === sid);
}

export async function sanitizeMergedChatFileUrl(
  type: "text" | "file",
  fileUrl: string | undefined,
  conversationId: string,
  senderId: string,
  previousFileUrl: string | undefined,
): Promise<string | undefined> {
  if (type !== "file") return undefined;
  const u = (fileUrl ?? "").trim();
  if (!u) return undefined;
  if (await isPrivateChatFileUrlAllowedInMessage(u, conversationId, senderId)) return u;
  const prev = (previousFileUrl ?? "").trim();
  return prev || undefined;
}
