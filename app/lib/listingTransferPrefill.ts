/** Client-side prefill after «Перенести объявление» (not a published listing). */
export type ListingTransferDraftPrefill = {
  title?: string;
  description?: string;
  /** Product form only — optional detected price in rubles. */
  price?: number;
  /** Remind user to upload photos locally (no external hotlinking). */
  showPhotoHint?: boolean;
  /** Original pasted listing page URL (always kept when user confirms draft). */
  sourceUrl?: string;
  /** True when auto-fetch failed — user fills fields manually. */
  manualFallback?: boolean;
  /** City/region hint from source page (user picks on map if needed). */
  location?: string;
  /** Raw category label from source — mapped per listing type on client. */
  categoryHint?: string;
  /** HTTPS image URLs for manual download (not auto-uploaded). */
  imageUrls?: string[];
};

export const MANUAL_TRANSFER_DRAFT_TITLE = "Черновик объявления";

export const LISTING_TRANSFER_DRAFT_STORAGE_KEY = "haliwali_transfer_listing_draft";

export const TRANSFER_FETCH_FAILED_HINT =
  "Не удалось автоматически получить данные. Ссылка сохранена, заполните поля вручную.";

/** Empty form prefill when metadata fetch failed but URL is valid. */
export function buildManualTransferDraft(sourceUrl: string): ListingTransferDraftPrefill {
  const url = sourceUrl.trim();
  return {
    sourceUrl: url,
    description: "",
    showPhotoHint: true,
    manualFallback: true,
  };
}

export function userTitleLocked(current: string): boolean {
  const t = current.trim();
  return t.length >= 4 && t !== MANUAL_TRANSFER_DRAFT_TITLE;
}

export function applyPrefillText(current: string, incoming: string | undefined, minKeep: number): string {
  if (current.trim().length >= minKeep) return current;
  const next = (incoming ?? "").trim();
  return next || current;
}

export function matchCategoryHint<T extends string>(
  hint: string | undefined,
  categories: readonly T[],
): T | undefined {
  const h = (hint ?? "").trim().toLowerCase();
  if (!h) return undefined;
  const exact = categories.find((c) => c.toLowerCase() === h);
  if (exact) return exact;
  return categories.find((c) => h.includes(c.toLowerCase()) || c.toLowerCase().includes(h));
}

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
