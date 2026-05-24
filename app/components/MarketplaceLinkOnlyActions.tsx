"use client";

import { useMemo } from "react";
import {
  groupProviderSearchActions,
  type MarketplaceProviderSearchAction,
} from "../lib/marketplaceProviderGateway";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";

function ProviderGatewayCard({ action }: { action: MarketplaceProviderSearchAction }) {
  const visual = getMarketplaceChipVisual(action.providerId);
  const q = action.normalizedQuery.trim();

  return (
    <article className="flex h-full flex-col rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)]">
      <div className="flex gap-3">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white shadow-sm"
          style={{ backgroundColor: visual.brandColor }}
          aria-hidden="true"
        >
          {visual.abbr}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight text-black">{action.name}</h3>
          <p className="mt-0.5 text-xs text-black/50">{action.regionLabel}</p>
          <p className="mt-1.5 text-xs leading-snug text-black/45">{action.deliveryNote}</p>
          {action.deliveryBadge ?
            <span className="mt-2 inline-block rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/55">
              {action.deliveryBadge}
            </span>
          : null}
        </div>
      </div>

      <p className="mt-4 text-sm text-black/60">
        Искать «<span className="font-medium text-black/80">{q}</span>» на {action.name}
      </p>

      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/[0.1] bg-black/[0.03] text-sm font-medium text-black/80 transition-colors hover:border-black/[0.16] hover:bg-black/[0.06]"
      >
        Открыть поиск
      </a>
    </article>
  );
}

export function MarketplaceLinkOnlyActions({
  actions,
  queryLabel,
}: {
  actions: readonly MarketplaceProviderSearchAction[];
  /** Shown above groups when search is active (e.g. normalized query). */
  queryLabel?: string;
}) {
  const groups = useMemo(() => groupProviderSearchActions(actions), [actions]);

  if (groups.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="marketplace-gateway-actions-heading">
      <div className="mb-5">
        <h2
          id="marketplace-gateway-actions-heading"
          className="text-base font-semibold text-black"
        >
          Поиск на выбранных площадках
        </h2>
        <p className="mt-0.5 text-xs text-black/40">
          Откройте поиск на маркетплейсе — Haliwali не подменяет каталог площадки.
        </p>
        {queryLabel ?
          <p className="mt-1 text-sm text-black/50">
            Запрос: <span className="font-medium text-black/75">«{queryLabel}»</span>
          </p>
        : null}
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.groupId}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-black/45">
              {group.groupTitle}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.actions.map((action) => (
                <li key={action.providerId}>
                  <ProviderGatewayCard action={action} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
