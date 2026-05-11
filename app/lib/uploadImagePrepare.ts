"use client";

/**
 * Resize / re-encode listing photos before `/api/upload` so mobile camera images stay under
 * limits and transfer faster (same server caps: 5 MB, jpeg/png/webp magic bytes).
 */

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.82;
/** Re-encode when larger than this to cut upload size on mobile networks. */
const REENCODE_IF_OVER_BYTES = 2.5 * 1024 * 1024;

const MIME_CAN_DECODE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Returns a `File` suitable for upload (usually JPEG). Falls back to original `file` when
 * no resize/recode is needed and size is already within limits.
 */
export async function prepareListingPhotoFileForUpload(file: File): Promise<File> {
  if (!file.size) throw new Error("empty_file");
  /** Skip decode for extreme sizes to avoid mobile OOM (user should pick a smaller photo). */
  if (file.size > 32 * 1024 * 1024) throw new Error("oversized_before_prepare");

  const mime = (file.type ?? "").trim().toLowerCase();
  const mayDecode = !mime || MIME_CAN_DECODE.has(mime);

  if (!mayDecode) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    // Prefer decoding directly into a bounded bitmap when supported (reduces peak memory on low-end devices).
    bitmap = await createImageBitmap(file, {
      resizeWidth: MAX_DIMENSION,
      resizeHeight: MAX_DIMENSION,
      resizeQuality: "high",
    });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
  }

  try {
    const bw = bitmap.width;
    const bh = bitmap.height;
    if (!Number.isFinite(bw + bh) || bw < 1 || bh < 1) {
      bitmap.close();
      bitmap = null;
      return file;
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bw, bh));
    const needResize = scale < 1;
    const needShrinkBytes = file.size > REENCODE_IF_OVER_BYTES;

    if (!needResize && !needShrinkBytes) {
      bitmap.close();
      bitmap = null;
      return file;
    }

    const w = Math.max(1, Math.round(bw * scale));
    const h = Math.max(1, Math.round(bh * scale));
    // Yield once before allocating/drawing a canvas to reduce long-task jank on low-end Android.
    await new Promise<void>((r) => setTimeout(r, 0));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      bitmap = null;
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, w, h);
    let blob = await canvasToJpegBlob(canvas, JPEG_QUALITY);
    if (blob.size > MAX_OUTPUT_BYTES) {
      blob = await canvasToJpegBlob(canvas, Math.max(0.55, JPEG_QUALITY - 0.2));
    }
    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new Error("still_too_large_after_prepare");
    }

    const base = (file.name || "photo").replace(/\.[^/.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    try {
      bitmap?.close();
    } catch {
      /* noop */
    }
  }
}
