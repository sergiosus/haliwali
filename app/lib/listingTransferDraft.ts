/** Client-side prefill after «Перенести объявление» (not a published listing). */
export type ListingTransferDraftPrefill = {
  title?: string;
  description?: string;
  /** Product form only — optional detected price in rubles. */
  price?: number;
  /** Remind user to upload photos locally (no external hotlinking). */
  showPhotoHint?: boolean;
};

export const LISTING_TRANSFER_DRAFT_STORAGE_KEY = "haliwali_transfer_listing_draft";

export function saveListingTransferDraft(draft: ListingTransferDraftPrefill): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LISTING_TRANSFER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* noop */
  }
}

export function readListingTransferDraft(): ListingTransferDraftPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LISTING_TRANSFER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as ListingTransferDraftPrefill;
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

export function clearListingTransferDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LISTING_TRANSFER_DRAFT_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
