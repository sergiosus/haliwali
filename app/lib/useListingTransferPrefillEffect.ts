"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  applyPrefillText,
  matchCategoryHint,
  type ListingTransferDraftPrefill,
  userTitleLocked,
} from "./listingTransferPrefill";

export function useListingTransferPrefillEffect({
  prefill,
  setTitle,
  setDescription,
  setPrice,
  setLocationDraft,
  categories,
  defaultCategory,
  onCategoryMatch,
  currentCategory,
}: {
  prefill?: ListingTransferDraftPrefill | null;
  setTitle: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setPrice?: Dispatch<SetStateAction<string>>;
  setLocationDraft?: Dispatch<SetStateAction<string>>;
  categories?: readonly string[];
  defaultCategory?: string;
  onCategoryMatch?: (matched: string) => void;
  currentCategory?: string;
}) {
  useEffect(() => {
    if (!prefill) return;

    setTitle((prev) => (userTitleLocked(prev) ? prev : applyPrefillText(prev, prefill.title, 4)));
    setDescription((prev) => applyPrefillText(prev, prefill.description, 10));

    if (setPrice) {
      setPrice((prev) => {
        if (prev.trim()) return prev;
        if (prefill.price != null && Number.isFinite(prefill.price) && prefill.price > 0) {
          return String(Math.round(prefill.price));
        }
        return prev;
      });
    }

    if (setLocationDraft && prefill.location?.trim()) {
      setLocationDraft((prev) => (prev.trim() ? prev : prefill.location!.trim()));
    }

    if (onCategoryMatch && categories?.length && prefill.categoryHint) {
      const matched = matchCategoryHint(prefill.categoryHint, categories);
      if (matched) {
        const def = defaultCategory ?? categories[0];
        const cur = currentCategory ?? def;
        if (cur === def) onCategoryMatch(matched);
      }
    }
  }, [
    prefill,
    categories,
    defaultCategory,
    currentCategory,
    onCategoryMatch,
    setTitle,
    setDescription,
    setPrice,
    setLocationDraft,
  ]);
}
