import { hasVerifiedSourceOfferPrice } from "./catalogOfferPriceDiagnostics";
import { resolveCoverImageUrl } from "./catalogSourceOfferCoverImage";
import {
  isUrlSlugTitleSource,
  normalizeTitleSource,
  truncateSlugDebug,
  type TitleSource,
} from "./catalogTitleCleanup";

export const SOURCE_OFFER_TITLE_MISSING = "Название не извлечено";
export const SOURCE_OFFER_TITLE_MISSING_HINT = "Откройте источник для просмотра";

export type SourceOfferCardDataLevel = "full" | "quick";

export type SourceOfferCardFields = {
  title?: string | null;
  titleSource?: TitleSource | string | null;
  city?: string | null;
  coverImageUrl?: string | null;
  imageUrl?: string | null;
  priceText?: string | null;
  priceAmount?: number | null;
  rawPayload?: Record<string, unknown> | null;
};

function readTitleSource(offer: SourceOfferCardFields): TitleSource | string | null {
  const direct = normalizeTitleSource(
    typeof offer.titleSource === "string" ? offer.titleSource : null,
  );
  if (direct) return direct;
  const raw = offer.rawPayload?.titleSource;
  return normalizeTitleSource(typeof raw === "string" ? raw : null);
}

export function isTitleManuallyEdited(offer: SourceOfferCardFields): boolean {
  return offer.rawPayload?.titleEdited === true;
}

/** Raw URL slug text for admin debug (never used as public title). */
export function sourceOfferUrlSlugRaw(offer: SourceOfferCardFields): string {
  const fromPayload = offer.rawPayload?.urlSlug;
  if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
  if (isUrlSlugTitleSource(readTitleSource(offer))) {
    const t = (offer.title ?? "").trim();
    if (t && t !== SOURCE_OFFER_TITLE_MISSING) return t;
  }
  return "";
}

export function sourceOfferAdminSlugDebugLine(offer: SourceOfferCardFields): string | null {
  const slug = sourceOfferUrlSlugRaw(offer);
  if (!slug || !isUrlSlugTitleSource(readTitleSource(offer))) return null;
  return `slug: ${truncateSlugDebug(slug)}`;
}

export function sourceOfferDisplayTitle(offer: SourceOfferCardFields): string {
  if (isTitleManuallyEdited(offer)) {
    const manual = (offer.title ?? "").trim();
    if (manual.length > 0) return manual;
  }
  const src = readTitleSource(offer);
  if (isUrlSlugTitleSource(src)) return SOURCE_OFFER_TITLE_MISSING;
  const raw = (offer.title ?? "").trim();
  if (!raw) return SOURCE_OFFER_TITLE_MISSING;
  return raw;
}

export function sourceOfferHasCoverImage(offer: SourceOfferCardFields): boolean {
  return Boolean(
    resolveCoverImageUrl({
      coverImageUrl: offer.coverImageUrl,
      imageUrl: offer.imageUrl,
      rawPayload: offer.rawPayload ?? undefined,
    }),
  );
}

export function sourceOfferHasPublishableTitle(offer: SourceOfferCardFields): boolean {
  if (isTitleManuallyEdited(offer)) {
    const t = (offer.title ?? "").trim();
    return t.length > 8 && t !== SOURCE_OFFER_TITLE_MISSING;
  }
  const src = readTitleSource(offer);
  if (isUrlSlugTitleSource(src)) return false;
  const title = sourceOfferDisplayTitle(offer);
  return title.length > 8 && title !== SOURCE_OFFER_TITLE_MISSING;
}

/** «Полные данные» when listing title, verified price, and cover image are all present. */
export function sourceOfferCardDataLevel(offer: SourceOfferCardFields): SourceOfferCardDataLevel {
  const hasRealTitle = sourceOfferHasPublishableTitle(offer);
  const hasPrice = hasVerifiedSourceOfferPrice(offer);
  const hasImage = sourceOfferHasCoverImage(offer);
  if (hasRealTitle && hasPrice && hasImage) return "full";
  return "quick";
}

export function sourceOfferCardStatusLabel(level: SourceOfferCardDataLevel): string {
  return level === "full" ? "Полные данные" : "Быстрый просмотр";
}

export function isSearchOnlySourceOffer(offer: SourceOfferCardFields): boolean {
  const parseStatus = offer.rawPayload?.parseStatus;
  return parseStatus === "search_only";
}

/** Publish gate: real title (not URL slug), city, price or image; search-only blocked. */
export function canPublishSourceOffer(offer: SourceOfferCardFields): boolean {
  if (isSearchOnlySourceOffer(offer)) return false;
  if (!sourceOfferHasPublishableTitle(offer)) return false;
  if (!(offer.city ?? "").trim()) return false;
  return hasVerifiedSourceOfferPrice(offer) || sourceOfferHasCoverImage(offer);
}

/** Search import selection — same title/city/price rules, no parseStatus gate. */
export function canPublishSearchResult(offer: SourceOfferCardFields): boolean {
  if (!sourceOfferHasPublishableTitle(offer)) return false;
  if (!(offer.city ?? "").trim()) return false;
  return hasVerifiedSourceOfferPrice(offer) || sourceOfferHasCoverImage(offer);
}
