import { categoryToSlug, productCategories, serviceCategories, taskCategories } from "./categories";
import {
  normalizeRussiaLocationLookupKey,
  resolveRussiaCityRegionDisplay,
} from "./locationDisplay";
import type { SelectedLocationSource } from "./selectedLocation";

export type ListingStatus = "pending" | "auto" | "approved" | "rejected";
export type ListingType = "task" | "service" | "product_sell" | "product_buy";
export type ListingDealStatus = "active" | "in_progress" | "completed";

/** User lifecycle — orthogonal to moderation `status`. */
export type ListingLifecycle = "live" | "deleted" | "archived";

export type DeletedListingSnapshot = {
  title: string;
  category: string;
  type: string;
  city: string;
  preview: string;
};

export const LISTING_SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const LISTING_COMPLAINT_PREVIEW_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
export const DELETED_DESCRIPTION_PREVIEW_MAX = 180;

export type BaseListing = {
  id: string;
  editToken: string;
  /** Id владельца / автора объявления (тот же пользователь, что и в сессии при сохранении). */
  ownerId?: string;
  /** Снимок подписи автора при сохранении: `StoredUser.name` или локальная часть email — не nickname/displayName. */
  authorPublicName?: string;
  /** Сделка: активно / в процессе / завершено (отдельно от модерации). */
  dealStatus?: ListingDealStatus;
  /** Корзина / архив; по умолчанию считается `live`. */
  listingLifecycle?: ListingLifecycle;
  deletedAt?: number;
  deletePermanentlyAt?: number;
  archivedAt?: number;
  deletedSnapshot?: DeletedListingSnapshot;
  type: ListingType;
  status: ListingStatus;
  moderationReason: string;
  title: string;
  description: string;
  categoryName: string;
  categorySlug: string;
  city: string;
  /** Свободный текст адреса; необязательно */
  address?: string;
  /** Широта (WGS-84), задаётся картой */
  latitude?: number;
  /** Долгота (WGS-84), задаётся картой */
  longitude?: number;
  /** When false/missing, public APIs must not expose exact address or coordinates. */
  addressPublic?: boolean;
  /** Deprecated: phone numbers are not shown publicly; stored server-side for moderation/contact. */
  phone?: string;
  photos: string[];
  createdAt: number;
  updatedAt?: number;
  /** Optional structured location for future geo backend readiness. */
  location?: {
    city: string;
    region?: string;
    displayName?: string;
    address?: string;
    lat?: number;
    lng?: number;
    source?: SelectedLocationSource;
  };
};

export type TaskListing = BaseListing & {
  type: "task";
};

export type ServiceListing = BaseListing & {
  type: "service";
  specialization: string;
};

export type ProductListing = BaseListing & {
  type: "product_sell" | "product_buy";
  price: number;
};

export type Listing = TaskListing | ServiceListing | ProductListing;

/** Last write wins per `id` — avoids duplicate rows in UI counts from API/race/StrictMode. */
export function dedupeListingsById(listings: readonly Listing[]): Listing[] {
  return [...new Map(listings.map((l) => [String(l.id), l] as const)).values()];
}

/** Legacy localStorage key — used only for optional draft restore, not authoritative listing data. */
export const LEGACY_LISTINGS_STORAGE_KEY = "haliwali_listings";

const LEGACY_KEYS = [
  "haliwali:listings:v1",
  "haliwali:listings:v2",
  "haliwali:listings:v3",
  "haliwali:listings:v4",
] as const;

export function generateEditToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function isPublicStatus(status: unknown): boolean {
  return status === "auto" || status === "approved" || status === "published";
}

export function normalizeListingLifecycle(raw: unknown): ListingLifecycle {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "deleted" || s === "archived") return s;
  return "live";
}

export function buildDeletedSnapshot(listing: Listing, previewMax = DELETED_DESCRIPTION_PREVIEW_MAX): DeletedListingSnapshot {
  const desc = (listing.description ?? "").replace(/\s+/g, " ").trim();
  const preview = desc.length <= previewMax ? desc : `${desc.slice(0, previewMax)}…`;
  const typeRu =
    listing.type === "task"
      ? "Задача"
      : listing.type === "service"
        ? "Услуга"
        : listing.type === "product_sell"
          ? "Продам"
          : "Куплю";
  return {
    title: (listing.title ?? "").trim(),
    category: (listing.categoryName ?? "").trim(),
    type: typeRu,
    city: (listing.city ?? "").trim(),
    preview,
  };
}

/** Публичные каталоги / поиск: только опубликованные по модерации и не в корзине/архиве. */
export function isListingPubliclyListed(l: Listing): boolean {
  if (!isPublicStatus(l.status)) return false;
  const lc = normalizeListingLifecycle(l.listingLifecycle);
  if (lc === "deleted" || lc === "archived") return false;
  const ds = (l.dealStatus ?? "active").trim();
  return ds === "active" || ds === "";
}

export function parseListings(raw: string | null): Listing[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).map((x) => migrateListingShape(x)) as Listing[];
  } catch {
    return [];
  }
}

function migrateListingShape(x: unknown): unknown {
  if (!x || typeof x !== "object") return x;
  const obj = x as Record<string, unknown>;

  const type = typeof obj.type === "string" ? obj.type : "";

  const categoryName =
    typeof obj.categoryName === "string"
      ? obj.categoryName
      : typeof obj.category === "string"
        ? obj.category
        : "";

  const normalizedCategoryName = (() => {
    if (!categoryName) return "";
    if (type === "service") {
      // If a category is already one of our fixed service categories, keep it.
      // (We only normalize legacy/renamed categories below.)
      const allowed = new Set(serviceCategories as readonly string[]);
      if (allowed.has(categoryName)) return categoryName;
      if (["Ремонт и бытовые услуги", "Строительство и ремонт", "Ремонт"].includes(categoryName))
        return "Ремонт и строительство";
      if (["Компьютеры и электроника", "Компьютеры"].includes(categoryName))
        return "Компьютеры и техника";
      if (categoryName === "Перевозки и доставка") return "Перевозки и доставка";
      if (categoryName === "Красота и здоровье") return "Красота и здоровье";
      if (categoryName === "Обучение") return "Обучение";
      if (categoryName === "Авто") return "Авто услуги";
      if (categoryName === "Уборка") return "Уборка";
      return "Другое";
    }

    if (type === "task") {
      const allowed = new Set(taskCategories as readonly string[]);
      if (allowed.has(categoryName)) return categoryName;
      if (["Доставка", "Перевозки и доставка"].includes(categoryName)) return "Доставка";
      return "Другое";
    }

    if (type === "product_sell" || type === "product_buy") {
      const allowed = new Set(productCategories as readonly string[]);
      return allowed.has(categoryName) ? categoryName : "Другое";
    }

    return categoryName;
  })();

  const categorySlug =
    typeof obj.categorySlug === "string"
      ? obj.categorySlug
      : normalizedCategoryName
        ? categoryToSlug(
            normalizedCategoryName,
            type === "task" || type === "service" || type === "product_sell" || type === "product_buy"
              ? (type as "task" | "service" | "product_sell" | "product_buy")
              : "task",
          )
        : "";

  if (!("categoryName" in obj)) obj.categoryName = normalizedCategoryName;
  if (!("categorySlug" in obj)) obj.categorySlug = categorySlug;

  if (typeof obj.status !== "string" || !obj.status) {
    obj.status = "auto";
  } else if (obj.status === "published") {
    obj.status = "approved";
  } else if (obj.status !== "pending" && obj.status !== "rejected" && obj.status !== "auto" && obj.status !== "approved") {
    obj.status = "pending";
  }

  if (typeof obj.moderationReason !== "string") obj.moderationReason = "";

  if (obj.categorySlug === "drugoe") {
    if (type === "task") obj.categorySlug = "zadachi-drugoe";
    else if (type === "service") obj.categorySlug = "uslugi-drugoe";
    else if (type === "product_sell" || type === "product_buy") obj.categorySlug = "tovary-drugoe";
  }

  if (typeof obj.editToken !== "string" || !obj.editToken) {
    obj.editToken = String(obj.id ?? generateEditToken());
  }

  if ("address" in obj && typeof obj.address !== "string") delete obj.address;

  const latOk = typeof obj.latitude === "number" && Number.isFinite(obj.latitude as number);
  const lonOk = typeof obj.longitude === "number" && Number.isFinite(obj.longitude as number);
  if (!latOk || !lonOk) {
    delete obj.latitude;
    delete obj.longitude;
  }

  if (typeof obj.addressPublic !== "boolean") obj.addressPublic = false;

  const existingLocationRaw = (obj as { location?: unknown }).location;
  const city = typeof obj.city === "string" ? obj.city.trim() : "";
  const address = typeof obj.address === "string" ? obj.address.trim() : "";
  const lat = typeof obj.latitude === "number" ? (obj.latitude as number) : undefined;
  const lng = typeof obj.longitude === "number" ? (obj.longitude as number) : undefined;
  const locObj =
    existingLocationRaw && typeof existingLocationRaw === "object" && existingLocationRaw
      ? (existingLocationRaw as Record<string, unknown>)
      : null;
  const storedRegion = typeof locObj?.region === "string" ? locObj.region.trim() : "";

  if (city) {
    const normalized = resolveRussiaCityRegionDisplay(city, storedRegion);
    const displayFromLoc =
      typeof locObj?.displayName === "string" ? `${locObj.displayName}`.trim() : "";
    const displayName =
      displayFromLoc ||
      (address.includes(",") ||
      (address.length > 0 &&
        normalizeRussiaLocationLookupKey(address) !== normalizeRussiaLocationLookupKey(normalized.city))
        ? address
        : normalized.displayName);
    const srcRaw = locObj?.source;
    const sourceOk =
      srcRaw === "suggestion" || srcRaw === "map" || srcRaw === "geolocation"
        ? (srcRaw as SelectedLocationSource)
        : undefined;
    obj.location = {
      city: normalized.city,
      region: normalized.region || undefined,
      displayName,
      address: address || undefined,
      lat: latOk ? lat : undefined,
      lng: lonOk ? lng : undefined,
      source: sourceOk,
    };
  }

  const ds = obj.dealStatus;
  if (ds !== "active" && ds !== "in_progress" && ds !== "completed") {
    obj.dealStatus = "active";
  }

  return obj;
}

/** Read legacy draft listings from localStorage keys (import flow only). */
export function readLegacyDraftListingsFromStorage(): Listing[] {
  if (typeof window === "undefined") return [];
  const primaryRaw = localStorage.getItem(LEGACY_LISTINGS_STORAGE_KEY);
  if (primaryRaw !== null) return parseListings(primaryRaw);
  for (const key of LEGACY_KEYS) {
    const legacyRaw = localStorage.getItem(key);
    if (!legacyRaw || legacyRaw === "[]") continue;
    return parseListings(legacyRaw);
  }
  return [];
}
