/** Public listing photos (`/api/upload`) — shared client + server cap. */
export const LISTING_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Long edge after client resize (mobile camera images). */
export const LISTING_PHOTO_MAX_DIMENSION = 1920;

/** Re-encode when larger than this so uploads stay fast on mobile networks. */
export const LISTING_PHOTO_REENCODE_IF_OVER_BYTES = 512 * 1024;

/** Skip client decode for extreme sizes to avoid mobile OOM. */
export const LISTING_PHOTO_PREPARE_INPUT_MAX_BYTES = 32 * 1024 * 1024;

export const LISTING_PHOTO_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export const LISTING_PHOTO_ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const;
