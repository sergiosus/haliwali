"use client";

import { useMemo } from "react";
import {
  groupProviderSearchActions,
  type MarketplaceProviderSearchAction,
} from "../lib/marketplaceProviderGateway";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";

function ProviderGatewayTile({ action }: { action: MarketplaceProviderSearchAction }) {
  const visual = getMarketplaceChipVisual(action.providerId);

  return (
    <article className="group flex items-center gap-3 rounded-xl border border-black/[0.06] bg-gradient-to-br from-white to-black/[0.02] p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] sm:gap-3.5 sm:p-3.5">
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm transition-transform duration-200 group-hover:scale-105 sm:h-11 sm:w-11"
        style={{ backgroundColor: visual.brandColor }}
        aria-hidden="true"
      >
        {visual.abbr}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-black sm:text-[15px]">{action.name}</h3>
        <p className="mt-0.5 truncate text-xs text-black/45">
          {action.regionLabel}
          <span className="mx-1 text-black/25">·</span>
          <span className="text-black/40">{action.deliveryNote}</span>
        </p>
      </div>
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#ff7a00] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#f07000] sm:h-10 sm:px-4 sm:text-sm"
      >
        Открыть
      </a>
    </article>
  );
}

export function MarketplaceLinkOnlyActions({
  actions,
  query,
}: {
  actions: readonly MarketplaceProviderSearchAction[];
  query: string;
}) {
  const groups = useMemo(() => groupProviderSearchActions(actions), [actions]);
  const trimmedQuery = query.trim();

  if (groups.length === 0 || !trimmedQuery) return null;

  return (
    <section className="space-y-5" aria-labelledby="marketplace-gateway-heading">
      <h2
        id="marketplace-gateway-heading"
        className="text-lg font-bold tracking-tight text-black/85 sm:text-xl"
      >
        Где искать «{trimmedQuery}»
      </h2>

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.groupId}>
            <h3 className="mb-2.5 text-sm font-semibold text-black/60">{group.groupTitle}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
              {group.actions.map((action) => (
                <li key={action.providerId}>
                  <ProviderGatewayTile action={action} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
