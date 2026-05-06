import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "";
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  const ft = await fileTypeFromBuffer(buf);
  const mime = ft?.mime ?? "";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 415 });
  }
  const ext = extFromMime(mime);
  if (!ext) return NextResponse.json({ error: "Invalid file type" }, { status: 415 });

  // TODO(VPS): integrate antivirus scanning (e.g., ClamAV) and quarantine on detection.
  const filename = `${randomUUID()}.${ext}`;
  const outPath = path.join(uploadsDir, filename);
  await fs.writeFile(outPath, buf);

  return NextResponse.json({ url: `/uploads/${filename}` });
}

