/**
 * eBay product previews via official API (when credentials are configured).
 * Returns empty until Browse API integration is added — gateway stays link-only.
 */

import type { ExternalMarketplaceCard, MarketplaceProvider } from "./externalMarketplaceProviders";
import { isEbayRealCardsAdapterEnabled } from "./marketplaceProviderGateway";

export async function tryEbayApiPreview(
  _provider: MarketplaceProvider,
  _normalizedQuery: string,
): Promise<ExternalMarketplaceCard[]> {
  if (!isEbayRealCardsAdapterEnabled()) return [];
  return [];
}
