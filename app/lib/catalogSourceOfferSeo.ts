import type { CatalogSourceOffer } from "./catalogSourceOfferTypes";
import { resolveSourceOfferDisplayCity } from "./catalogSourceOfferDisplay";

/** Canonical public URL for a published source offer. */
export function sourceOfferPublicPath(id: number | string): string {
  const n = typeof id === "number" ? id : Number(String(id).trim());
  if (!Number.isFinite(n) || n <= 0) return "/catalogs/predlozheniya";
  return `/catalogs/predlozheniya/${n}`;
}

export function sourceOfferPageTitle(title: string, city: string | null | undefined): string {
  const t = title.trim() || "Предложение";
  const c = (city ?? "").trim();
  return c ? `${t} — ${c} | Haliwali` : `${t} | Haliwali`;
}

export function sourceOfferMetaDescription(offer: Pick<CatalogSourceOffer, "shortSnippet" | "title">): string {
  const snippet = (offer.shortSnippet ?? "").trim();
  if (snippet.length >= 80) return snippet.slice(0, 160);
  const t = (offer.title ?? "").trim();
  return snippet || t || "Предложение с внешней площадки на Haliwali.";
}

export function sourceOfferDisplayCityLabel(
  offer: Parameters<typeof resolveSourceOfferDisplayCity>[0],
  fallbackCity?: string,
): string | null {
  return resolveSourceOfferDisplayCity(offer, fallbackCity);
}
