/**
 * Single cover image for external offers — no galleries.
 */

export type { AvitoCoverImageSource, AvitoCoverExtraction } from "./catalogAvitoCoverImage";
export {
  extractAvitoCoverFromCardContext,
  extractAvitoListingThumbnail,
  resolveAvitoImageUrl,
  coverImageDiagnosticsLabel,
} from "./catalogAvitoCoverImage";

export function sanitizeCoverImageUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (!/^https:\/\//i.test(t)) return null;
  return t.slice(0, 500);
}

/** Pick one cover URL: explicit > raw_payload > legacy imageUrl. */
export function resolveCoverImageUrl(opts: {
  coverImageUrl?: string | null;
  imageUrl?: string | null;
  rawPayload?: Record<string, unknown> | null;
}): string | null {
  const direct = sanitizeCoverImageUrl(opts.coverImageUrl ?? opts.imageUrl);
  if (direct) return direct;
  const raw = opts.rawPayload;
  if (!raw || typeof raw !== "object") return null;
  const fromRaw =
    raw.coverImageUrl ?? raw.cover_image_url ?? raw.imageUrl ?? raw.image_url;
  return sanitizeCoverImageUrl(fromRaw);
}

/** Strip gallery arrays from payload — keep metadata only. */
export function slimSourceOfferRawPayload(
  raw: Record<string, unknown> | undefined,
  coverImageUrl: string | null | undefined,
  imageSource?: string | null,
): Record<string, unknown> {
  const base = { ...(raw ?? {}) };
  delete base.images;
  delete base.photos;
  delete base.gallery;
  delete base.imageUrls;
  const cover = sanitizeCoverImageUrl(coverImageUrl);
  if (cover) {
    base.coverImageUrl = cover;
    if (imageSource) base.imageSource = imageSource;
  } else {
    base.imageSource = imageSource ?? "none";
  }
  const priceSource = raw?.priceSource;
  if (typeof priceSource === "string") base.priceSource = priceSource;
  delete base.imageUrl;
  delete base.image_url;
  return base;
}

/** Persist slim JSONB (cover only in column + payload hint). */
export function rawPayloadForDb(
  raw: Record<string, unknown> | undefined,
  coverImageUrl: string | null | undefined,
  imageSource?: string | null,
): Record<string, unknown> {
  return slimSourceOfferRawPayload(raw, coverImageUrl, imageSource);
}
