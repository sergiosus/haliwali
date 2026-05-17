"use client";

import {
  LISTING_PHOTO_MAX_BYTES,
  LISTING_PHOTO_MAX_DIMENSION,
  LISTING_PHOTO_PREPARE_INPUT_MAX_BYTES,
  LISTING_PHOTO_REENCODE_IF_OVER_BYTES,
} from "./listingPhotoLimits";

const JPEG_QUALITY = 0.82;

const MIME_CAN_DECODE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export class ListingPhotoPrepareError extends Error {
  constructor(
    readonly code:
      | "empty_file"
      | "input_too_large"
      | "unsupported_type"
      | "decode_failed"
      | "still_too_large",
    message: string,
  ) {
    super(message);
    this.name = "ListingPhotoPrepareError";
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("img_load_failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeToCanvasSource(
  file: File,
): Promise<{ width: number; height: number; paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file, {
        resizeWidth: LISTING_PHOTO_MAX_DIMENSION,
        resizeHeight: LISTING_PHOTO_MAX_DIMENSION,
        resizeQuality: "high",
      });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    const bw = bitmap.width;
    const bh = bitmap.height;
    return {
      width: bw,
      height: bh,
      paint: (ctx, w, h) => ctx.drawImage(bitmap!, 0, 0, w, h),
      cleanup: () => {
        try {
          bitmap?.close();
        } catch {
          /* noop */
        }
        bitmap = null;
      },
    };
  } catch {
    try {
      bitmap?.close();
    } catch {
      /* noop */
    }
    bitmap = null;
  }

  try {
    const img = await loadImageElement(file);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      paint: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => {
        /* noop */
      },
    };
  } catch {
    throw new ListingPhotoPrepareError(
      "decode_failed",
      "Не удалось обработать фото. Попробуйте другое изображение (JPG, PNG или WebP).",
    );
  }
}

async function encodeCanvasToJpegFile(
  canvas: HTMLCanvasElement,
  baseName: string,
): Promise<File> {
  const qualities = [JPEG_QUALITY, 0.72, 0.62, 0.52];
  let last: Blob | null = null;
  for (const q of qualities) {
    const blob = await canvasToJpegBlob(canvas, q);
    last = blob;
    if (blob.size <= LISTING_PHOTO_MAX_BYTES) {
      const base = baseName.replace(/\.[^/.]+$/, "") || "photo";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    }
  }
  if (last && last.size <= LISTING_PHOTO_MAX_BYTES) {
    const base = baseName.replace(/\.[^/.]+$/, "") || "photo";
    return new File([last], `${base}.jpg`, { type: "image/jpeg" });
  }
  throw new ListingPhotoPrepareError(
    "still_too_large",
    "Файл больше 5 МБ даже после сжатия. Выберите другое фото или уменьшите его в галерее.",
  );
}

/**
 * Returns a `File` suitable for `/api/upload` (usually JPEG, max 5 MB, long edge ≤ 1920px).
 */
export async function prepareListingPhotoFileForUpload(file: File): Promise<File> {
  if (!file.size) {
    throw new ListingPhotoPrepareError("empty_file", "Фото не удалось загрузить. Проверьте формат и размер файла.");
  }
  if (file.size > LISTING_PHOTO_PREPARE_INPUT_MAX_BYTES) {
    throw new ListingPhotoPrepareError(
      "input_too_large",
      "Фото слишком большое. Выберите изображение меньшего размера.",
    );
  }

  const mime = (file.type ?? "").trim().toLowerCase();
  const mayDecode = !mime || MIME_CAN_DECODE.has(mime);
  if (!mayDecode) {
    if (file.size > LISTING_PHOTO_MAX_BYTES) {
      throw new ListingPhotoPrepareError(
        "still_too_large",
        "Файл больше 5 МБ. Выберите фото меньшего размера или сожмите его перед загрузкой.",
      );
    }
    return file;
  }

  const { width: bw, height: bh, paint, cleanup } = await decodeToCanvasSource(file);
  try {
    if (!Number.isFinite(bw + bh) || bw < 1 || bh < 1) {
      throw new ListingPhotoPrepareError("decode_failed", "Не удалось обработать фото.");
    }

    const scale = Math.min(1, LISTING_PHOTO_MAX_DIMENSION / Math.max(bw, bh));
    const needResize = scale < 1;
    const needShrinkBytes = file.size > LISTING_PHOTO_REENCODE_IF_OVER_BYTES;

    if (!needResize && !needShrinkBytes && file.size <= LISTING_PHOTO_MAX_BYTES) {
      return file;
    }

    const w = Math.max(1, Math.round(bw * scale));
    const h = Math.max(1, Math.round(bh * scale));
    await new Promise<void>((r) => setTimeout(r, 0));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new ListingPhotoPrepareError("decode_failed", "Не удалось обработать фото.");
    }

    paint(ctx, w, h);
    return encodeCanvasToJpegFile(canvas, file.name || "photo");
  } finally {
    cleanup();
  }
}

/** Pick-time prepare (create/edit forms): compress early + preview blob URL. */
export async function prepareListingPhotoForPicker(
  file: File,
): Promise<{ file: File; objectUrl: string }> {
  const prepared = await prepareListingPhotoFileForUpload(file);
  return { file: prepared, objectUrl: URL.createObjectURL(prepared) };
}

export function listingPhotoPrepareUserMessage(err: unknown): string {
  if (err instanceof ListingPhotoPrepareError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Не удалось обработать фото. Попробуйте другое изображение.";
}
