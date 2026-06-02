/**
 * Single cover image for external offers — no galleries.
 */

/** First listing thumbnail from Avito SERP card HTML/JSON fragment. */
export function extractAvitoListingThumbnail(ctx: string): string | null {
  if (!ctx?.trim()) return null;
  const blob = ctx.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  const patterns = [
    /https:\/\/\d+\.img\.avito\.st\/image\/[^\s"'<>\\]+/i,
    /"(https:\/\/[^"]+img\.avito\.st[^"]+)"/i,
    /src="(https:\/\/[^"]*img\.avito[^"]*\.(?:jpg|jpeg|webp)[^"]*)"/i,
    /"(\d+x\d+)"\s*:\s*"(https:\/\/[^"]+img\.avito[^"]+)"/i,
    /"imageUrl"\s*:\s*"(https:\/\/[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    const raw = m?.[1] ?? m?.[0];
    if (!raw) continue;
    const url = sanitizeCoverImageUrl(raw.split(/["#\s]/)[0]);
    if (url) return url;
  }
  return null;
}

export function sanitizeCoverImageUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return null;
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
): Record<string, unknown> {
  const base = { ...(raw ?? {}) };
  delete base.images;
  delete base.photos;
  delete base.gallery;
  delete base.imageUrls;
  const cover = sanitizeCoverImageUrl(coverImageUrl);
  if (cover) {
    base.coverImageUrl = cover;
  }
  delete base.imageUrl;
  delete base.image_url;
  return base;
}

/** Persist slim JSONB (cover only in column + payload hint). */
export function rawPayloadForDb(
  raw: Record<string, unknown> | undefined,
  coverImageUrl: string | null | undefined,
): Record<string, unknown> {
  return slimSourceOfferRawPayload(raw, coverImageUrl);
}
