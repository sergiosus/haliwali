/**
 * Filters fake / search-link marketplace rows from user-visible results.
 */

import type { ExternalMarketplaceCard } from "./externalMarketplaceProviders";
import {
  isFakeMarketplaceTitle,
  isProviderCatalogSearchUrl,
  validateMarketplaceProductCard,
} from "./marketplaceProductQuality";

export { isFakeMarketplaceTitle, isProviderCatalogSearchUrl } from "./marketplaceProductQuality";

export function isRealMarketplaceProductCard(
  card: ExternalMarketplaceCard,
  normalizedQuery: string,
): boolean {
  return validateMarketplaceProductCard(card, normalizedQuery).ok;
}

export function countFakeMarketplaceCards(
  cards: ExternalMarketplaceCard[],
  normalizedQuery: string,
): number {
  return cards.filter((c) => !isRealMarketplaceProductCard(c, normalizedQuery)).length;
}

export function filterRealMarketplaceCards(
  cards: ExternalMarketplaceCard[],
  normalizedQuery: string,
): ExternalMarketplaceCard[] {
  return cards.filter((c) => isRealMarketplaceProductCard(c, normalizedQuery));
}
