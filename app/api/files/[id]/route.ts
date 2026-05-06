import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  CHAT_PRIVATE_UPLOADS_ROOT,
  isChatPrivateFileId,
  readChatPrivateFileMetaWithStorage,
} from "../../../lib/serverChatPrivateFiles";
import { isListingConversationParticipant } from "../../../lib/serverListingChatsStore";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent((raw ?? "").trim());
  if (!isChatPrivateFileId(id)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!uid) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const metaFull = await readChatPrivateFileMetaWithStorage(id);
  if (!metaFull) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!isListingConversationParticipant(uid, metaFull.chatId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const objectsRoot = path.resolve(path.join(CHAT_PRIVATE_UPLOADS_ROOT, "chat"));
  const resolvedFile = path.resolve(metaFull.storagePath);
  const rel = path.relative(objectsRoot, resolvedFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    await stat(resolvedFile);
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const nodeStream = createReadStream(resolvedFile);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": metaFull.mime || "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
