/**
 * Listing edit PATCH payload — server-shaped body + photo normalization.
 */

import { publicListingImageSrc } from "./listingCardMeta";
import type { Listing, ProductListing, ServiceListing } from "./listingModel";
import { sanitizeListingAttributesForListing } from "./listingAttributes";

function isListingsApiError(err: unknown): err is {
  status: number;
  message: string;
  payload: { error?: string; message?: string; reason?: string } | null;
} {
  return (
    err instanceof Error &&
    err.name === "ListingsApiError" &&
    typeof (err as { status?: unknown }).status === "number"
  );
}

const MAX_LISTING_PHOTOS = 10;

/** Persist only public upload paths; drop blob/data URLs and duplicates. */
export function normalizeListingPhotosForSave(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const normalized = publicListingImageSrc(String(raw ?? "").trim());
    if (!normalized) continue;
    const lower = normalized.toLowerCase();
    if (lower.startsWith("blob:") || lower.startsWith("data:")) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_LISTING_PHOTOS) break;
  }
  return out;
}

/** JSON body for PATCH /api/listings/[id] — matches parseListingBody expectations. */
export function buildListingUpdateBody(listing: Listing): Record<string, unknown> {
  const photos = normalizeListingPhotosForSave(listing.photos ?? []);
  const attrs = sanitizeListingAttributesForListing(
    {
      categoryName: listing.categoryName,
      categorySlug: listing.categorySlug,
      type: listing.type,
    },
    listing.attributes,
  );

  const base: Record<string, unknown> = {
    id: listing.id,
    editToken: listing.editToken,
    type: listing.type,
    status: listing.status,
    moderationReason: listing.moderationReason ?? "",
    dealStatus: listing.dealStatus ?? "active",
    title: listing.title,
    description: listing.description,
    categoryName: listing.categoryName,
    categorySlug: listing.categorySlug,
    city: listing.city ?? "",
    phone: listing.phone ?? "",
    photos,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt ?? Date.now(),
  };

  if (listing.address?.trim()) base.address = listing.address.trim();
  if (typeof listing.latitude === "number" && Number.isFinite(listing.latitude)) {
    base.latitude = listing.latitude;
  }
  if (typeof listing.longitude === "number" && Number.isFinite(listing.longitude)) {
    base.longitude = listing.longitude;
  }
  if (listing.addressPublic === true) base.addressPublic = true;

  if (attrs && Object.keys(attrs).length > 0) base.attributes = attrs;

  if (listing.type === "service") {
    const s = listing as ServiceListing;
    base.specialization = typeof s.specialization === "string" ? s.specialization : "";
    return base;
  }

  if (listing.type === "product_sell" || listing.type === "product_buy") {
    const p = listing as ProductListing;
    const price =
      typeof p.price === "number" && Number.isFinite(p.price) ? p.price : Number(p.price);
    base.price = Number.isFinite(price) ? price : 0;
    return base;
  }

  return base;
}

export type ListingEditSaveErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_EDITABLE"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "SERVER_ERROR"
  | "NETWORK"
  | "UPLOAD"
  | "UNKNOWN";

/** Safe user-facing + dev detail for edit save failures. */
export function listingEditSaveErrorMessage(
  err: unknown,
  opts?: { devDetail?: boolean },
): { userMessage: string; code: ListingEditSaveErrorCode; devDetail?: string } {
  const dev = opts?.devDetail ?? process.env.NODE_ENV !== "production";

  if (err && typeof err === "object" && (err as { kind?: string }).kind === "upload") {
    const msg = typeof (err as { message?: string }).message === "string" ? (err as { message: string }).message : "Не удалось загрузить фото.";
    return { userMessage: msg, code: "UPLOAD", devDetail: dev ? "upload_fail" : undefined };
  }

  if (isListingsApiError(err)) {
    const serverErr =
      typeof err.payload?.error === "string" ? err.payload.error : err.message;
    const reason = typeof err.payload?.reason === "string" ? err.payload.reason : "";
    const devDetail = dev ? `${err.status} ${serverErr}${reason ? ` (${reason})` : ""}` : undefined;

    if (err.status === 401 || serverErr === "UNAUTHORIZED") {
      return { userMessage: "Войдите в аккаунт и попробуйте снова.", code: "UNAUTHORIZED", devDetail };
    }
    if (err.status === 403 || serverErr === "FORBIDDEN") {
      return { userMessage: "Нет доступа для сохранения.", code: "FORBIDDEN", devDetail };
    }
    if (serverErr === "LISTING_NOT_EDITABLE") {
      return {
        userMessage: "Это объявление нельзя редактировать (архив или корзина).",
        code: "NOT_EDITABLE",
        devDetail,
      };
    }
    if (err.status === 413) {
      return {
        userMessage: "Слишком большой объём данных. Уменьшите описание или число фото.",
        code: "PAYLOAD_TOO_LARGE",
        devDetail,
      };
    }
    if (err.status === 400 || serverErr === "BAD_REQUEST") {
      return {
        userMessage: dev
          ? `Проверка данных не пройдена${reason ? `: ${reason}` : ""}.`
          : "Проверьте поля объявления и попробуйте снова.",
        code: "VALIDATION",
        devDetail,
      };
    }
    if (err.status >= 500 || serverErr === "SERVER_ERROR") {
      return {
        userMessage: "Сервер временно недоступен. Попробуйте позже.",
        code: "SERVER_ERROR",
        devDetail,
      };
    }
    return {
      userMessage: "Не удалось сохранить. Попробуйте ещё раз.",
      code: "UNKNOWN",
      devDetail,
    };
  }

  if (err instanceof Error) {
    if (err.message === "NOT_FOUND") {
      return {
        userMessage: "Объявление не найдено.",
        code: "NOT_FOUND",
        devDetail: dev ? "NOT_FOUND" : undefined,
      };
    }
  }

  const api = err as { status?: number; message?: string; payload?: { error?: string; message?: string } } | null;
  if (api && typeof api.status === "number") {
    const serverErr =
      typeof api.payload?.error === "string" ? api.payload.error : api.message ?? "UPDATE_FAILED";
    const devDetail = dev ? `${api.status} ${serverErr}` : undefined;

    if (api.status === 401 || serverErr === "UNAUTHORIZED") {
      return { userMessage: "Войдите в аккаунт и попробуйте снова.", code: "UNAUTHORIZED", devDetail };
    }
    if (api.status === 403 || serverErr === "FORBIDDEN") {
      return { userMessage: "Нет доступа для сохранения.", code: "FORBIDDEN", devDetail };
    }
    if (serverErr === "LISTING_NOT_EDITABLE") {
      return {
        userMessage: "Это объявление нельзя редактировать (архив или корзина).",
        code: "NOT_EDITABLE",
        devDetail,
      };
    }
    if (api.status === 413) {
      return {
        userMessage: "Слишком большой объём данных. Уменьшите описание или число фото.",
        code: "PAYLOAD_TOO_LARGE",
        devDetail,
      };
    }
    if (api.status === 400 || serverErr === "BAD_REQUEST") {
      return {
        userMessage: dev
          ? `Проверка данных не пройдена (${serverErr}).`
          : "Проверьте поля объявления и попробуйте снова.",
        code: "VALIDATION",
        devDetail,
      };
    }
    if (api.status >= 500 || serverErr === "SERVER_ERROR") {
      return {
        userMessage: "Сервер временно недоступен. Попробуйте позже.",
        code: "SERVER_ERROR",
        devDetail,
      };
    }
    return {
      userMessage: "Не удалось сохранить. Попробуйте ещё раз.",
      code: "UNKNOWN",
      devDetail,
    };
  }

  return {
    userMessage: "Не удалось сохранить. Попробуйте ещё раз.",
    code: "NETWORK",
    devDetail: dev && err instanceof Error ? err.message : undefined,
  };
}
