import type { Listing } from "./listingModel";

/**
 * Normalizes stored listing photo URLs for browser `<img src>` (uploads are root-relative).
 * Legacy rows may omit the leading `/`, which breaks resolution on nested routes
 * (e.g. `/listing/service-123-title` → wrong `.../listing/uploads/...`).
 */
export function publicListingImageSrc(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:")
  ) {
    return t;
  }
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("/")) return t;
  return `/${t.replace(/^\/+/, "")}`;
}

function normalizePhotoUrlList(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const n = publicListingImageSrc(u);
    if (n) out.push(n);
  }
  return out;
}

export function extractListingPhotos(listing: unknown): string[] {
  const l = listing as {
    photos?: unknown;
    images?: unknown;
    imageUrls?: unknown;
    photoUrls?: unknown;
  };
  const candidates = [l.photos, l.images, l.imageUrls, l.photoUrls];
  for (const c of candidates) {
    if (Array.isArray(c) && c.every((x): x is string => typeof x === "string")) {
      return normalizePhotoUrlList(c);
    }
  }
  return [];
}

/** City line: concrete city or whole-Russia style listings. */
export function listingCardLocationLine(listing: Listing): string {
  const city = (listing.city ?? "").trim();
  if (city) return city;
  const dn = (listing.location?.displayName ?? "").trim();
  if (dn.toLowerCase().includes("росси") || dn === "Вся Россия") return "Вся Россия";
  if (dn) return dn.split(",")[0]?.trim() || "Вся Россия";
  return "Вся Россия";
}

export function listingDealStatusBadgeRu(listing: Listing): string {
  const ds = listing.dealStatus ?? "active";
  if (ds === "completed") return "Завершено";
  if (ds === "in_progress") return "В работе";
  return "Активно";
}

/** Короткая подпись типа объявления для бейджа на карточке. */
export function listingTypeBadgeRu(type: Listing["type"] | string | undefined): string {
  if (type === "task") return "Задача";
  if (type === "service") return "Услуга";
  if (type === "product_sell" || type === "product_buy") return "Товар";
  return "Объявление";
}

export function formatListingCardDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatViewCountRu(n: number): string {
  const nAbs = Math.abs(n) % 100;
  const v = nAbs % 10;
  if (nAbs > 10 && nAbs < 20) return `${n} просмотров`;
  if (v === 1) return `${n} просмотр`;
  if (v >= 2 && v <= 4) return `${n} просмотра`;
  return `${n} просмотров`;
}

export function listingPriceSnippet(listing: Listing): string | null {
  if (listing.type === "product_sell" || listing.type === "product_buy") {
    return `${Intl.NumberFormat("ru-RU").format(listing.price)} ₽`;
  }
  return null;
}
