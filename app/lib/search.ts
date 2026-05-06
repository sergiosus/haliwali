"use client";

import type { Listing } from "./listings";
import { normalizeQuery } from "./directory";
import { buildSearchVariants } from "./utils/keyboardLayout";

function typeLabel(listing: Listing) {
  if (listing.type === "task") return "задача";
  if (listing.type === "service") return "услуга";
  if (listing.type === "product_sell") return "товар продам продажа";
  return "товар куплю покупка";
}

function productKindLabel(listing: Listing) {
  if (listing.type === "product_sell") return "продам";
  if (listing.type === "product_buy") return "куплю";
  return "";
}

export function listingSearchHaystack(listing: Listing) {
  const categoryName = listing.categoryName ?? "";
  const categorySlug = listing.categorySlug ?? "";

  const parts = [
    listing.title ?? "",
    listing.description ?? "",
    categoryName,
    categorySlug,
    listing.city ?? "",
    listing.address ?? "",
    listing.type,
    typeLabel(listing),
    productKindLabel(listing),
  ];

  // specialization + price (optional) are not required but help search quality
  if ("specialization" in listing) parts.push(listing.specialization ?? "");
  if ("price" in listing) parts.push(String(listing.price ?? ""));

  return normalizeQuery(parts.join(" "));
}

export function matchesListingQuery(listing: Listing, query: string) {
  const variants = buildSearchVariants(query);
  if (variants.length === 0) return true;
  const hay = listingSearchHaystack(listing);
  return variants.some((v) => hay.includes(v));
}

/** Pre-normalized haystack (e.g. category labels) vs raw user query; applies EN→RU variants. */
export function haystackNormalizedMatchesListingSearch(haystackLower: string, rawQuery: string): boolean {
  const variants = buildSearchVariants(rawQuery);
  if (variants.length === 0) return true;
  return variants.some((v) => haystackLower.includes(v));
}

