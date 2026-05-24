import type { MarketplaceProviderId } from "./externalMarketplaceProviders";
import {
  buildMarketplaceProviderSearchUrl,
  getMarketplaceProviderById,
} from "./externalMarketplaceProviders";
import {
  findGatewayProvider,
  findGatewayRegionGroup,
  isRealCardsMarketplaceAdapter,
  marketplaceDeliveryBadge,
  sanitizeSelectedProviderIds,
  type MarketplaceProviderSearchAction,
} from "./marketplaceProviderGateway";
import { prepareMarketplaceGatewayQuery } from "./marketplaceSearchPrepare";

export function splitSelectedProvidersForSearch(ids: readonly string[]): {
  sanitized: MarketplaceProviderId[];
  realCardsIds: MarketplaceProviderId[];
  linkOnlyIds: MarketplaceProviderId[];
} {
  const sanitized = sanitizeSelectedProviderIds(ids);
  const realCardsIds: MarketplaceProviderId[] = [];
  const linkOnlyIds: MarketplaceProviderId[] = [];
  for (const id of sanitized) {
    if (isRealCardsMarketplaceAdapter(id)) realCardsIds.push(id);
    else linkOnlyIds.push(id);
  }
  return { sanitized, realCardsIds, linkOnlyIds };
}

/** One outbound search action per selected provider (smart gateway, country metadata). */
export function buildProviderSearchActions(
  selectedIds: readonly MarketplaceProviderId[],
  rawQuery: string,
): MarketplaceProviderSearchAction[] {
  const prepared = prepareMarketplaceGatewayQuery(rawQuery);
  const q = prepared.normalizedQuery.trim() || "товары";
  const actions: MarketplaceProviderSearchAction[] = [];

  for (const id of sanitizeSelectedProviderIds(selectedIds)) {
    const reg = getMarketplaceProviderById(id);
    const meta = findGatewayProvider(id);
    const regionGroup = findGatewayRegionGroup(id);
    const href = buildMarketplaceProviderSearchUrl(id, rawQuery);
    if (!reg || !meta || !href) continue;

    actions.push({
      providerId: id,
      name: reg.name,
      regionLabel: meta.regionLabel,
      deliveryNote: meta.deliveryNote,
      deliveryBadge: marketplaceDeliveryBadge(meta.deliveryNote),
      href,
      normalizedQuery: q,
      groupId: regionGroup?.id ?? "other",
      groupTitle: regionGroup?.title ?? meta.regionLabel,
    });
  }
  return actions;
}

/** @deprecated Use buildProviderSearchActions */
export const buildLinkOnlyActions = buildProviderSearchActions;
