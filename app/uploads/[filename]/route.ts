import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function extLower(name: string) {
  const n = (name ?? "").toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx) : "";
}

function contentTypeForExt(ext: string): string {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function safeFilename(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  // Block any path traversal or encoded separators.
  if (t.includes("/") || t.includes("\\") || t.includes("..")) return null;
  const base = path.basename(t);
  if (base !== t) return null;
  return base;
}

export async function GET(_: Request, ctx: { params: Promise<{ filename: string }> }) {
  const { filename: raw } = await ctx.params;
  const filename = safeFilename(raw);
  if (!filename) return new NextResponse(null, { status: 404 });

  const ext = extLower(filename);
  if (!ALLOWED_EXTS.has(ext)) return new NextResponse(null, { status: 404 });

  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  let buf: Buffer;
  try {
    buf = await readFile(filePath);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  // NextResponse body must be BodyInit; use Uint8Array view.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

