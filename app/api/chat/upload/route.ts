import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import {
  CHAT_UPLOAD_MAX_BYTES,
  CHAT_UPLOAD_MIME_SET,
  chatUploadExtFromMime,
} from "../../../lib/chatUploadConstraints";
import {
  privateChatFileApiUrl,
  savePrivateChatFile,
} from "../../../lib/serverChatPrivateFiles";
import { isListingConversationParticipant } from "../../../lib/serverListingChatsStore";
import { chatUserBlockedForbidden } from "../../../lib/serverChatUserBlock";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const csrf = denyIfMutationOriginForbidden(req);
    if (csrf) return csrf;

    const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
    if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const chatIdRaw = typeof form.get("chatId") === "string" ? (form.get("chatId") as string).trim() : "";
    if (!chatIdRaw || !isListingConversationParticipant(userId, chatIdRaw)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const peerUserId = chatIdRaw
      .split("::")
      .map((part) => part.trim())
      .filter(Boolean)
      .find((part) => part !== userId);
    if (peerUserId) {
      const blockedForbidden = await chatUserBlockedForbidden(userId, peerUserId);
      if (blockedForbidden) return blockedForbidden;
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const size = typeof file.size === "number" ? file.size : 0;
    if (!size || size > CHAT_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ft = await fileTypeFromBuffer(buf);
    const mime = ft?.mime ?? "";
    if (!CHAT_UPLOAD_MIME_SET.has(mime)) return NextResponse.json({ error: "Invalid file type" }, { status: 415 });
    const ext = chatUploadExtFromMime(mime);
    if (!ext) return NextResponse.json({ error: "Invalid file type" }, { status: 415 });

    const fileId = randomUUID();

    // TODO(VPS): integrate antivirus scanning (e.g., ClamAV) and quarantine on detection.
    await savePrivateChatFile({
      buffer: buf,
      chatId: chatIdRaw,
      uploadedBy: userId,
      ext,
      mime,
      fileId,
      originalName: file.name,
      sizeBytes: size,
    });

    return NextResponse.json({ url: privateChatFileApiUrl(fileId), fileId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

