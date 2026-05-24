"use client";

import { useMemo } from "react";
import {
  groupProviderSearchActions,
  type MarketplaceProviderSearchAction,
} from "../lib/marketplaceProviderGateway";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";

function platformCountPhrase(count: number): string {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `Подготовили поиск на ${n} площадках`;
  if (mod10 === 1) return `Подготовили поиск на ${n} площадке`;
  if (mod10 >= 2 && mod10 <= 4) return `Подготовили поиск на ${n} площадки`;
  return `Подготовили поиск на ${n} площадках`;
}

function ProviderGatewayCard({
  action,
  query,
}: {
  action: MarketplaceProviderSearchAction;
  query: string;
}) {
  const visual = getMarketplaceChipVisual(action.providerId);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_2px_14px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)]">
      <div className="flex gap-3">
        <span
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: visual.brandColor }}
          aria-hidden="true"
        >
          {visual.abbr}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight text-black">{action.name}</h3>
          <p className="mt-1 text-xs text-black/50">{action.regionLabel}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-black/45">{action.deliveryNote}</p>
        </div>
      </div>

      {query ?
        <p className="mt-4 text-[11px] leading-snug text-black/40">
          Поиск по запросу: <span className="font-medium text-black/65">{query}</span>
        </p>
      : null}

      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#ff7a00] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#f07000] active:bg-[#e56800]"
      >
        Открыть поиск
      </a>
    </article>
  );
}

export function MarketplaceLinkOnlyActions({
  actions,
  query,
}: {
  actions: readonly MarketplaceProviderSearchAction[];
  /** Original user query for headings and card subtitles. */
  query: string;
}) {
  const groups = useMemo(() => groupProviderSearchActions(actions), [actions]);
  const trimmedQuery = query.trim();
  const totalActions = actions.length;

  if (groups.length === 0 || !trimmedQuery) return null;

  return (
    <section className="space-y-6" aria-labelledby="marketplace-gateway-heading">
      <header className="space-y-1.5">
        <h2
          id="marketplace-gateway-heading"
          className="text-xl font-bold tracking-tight text-black sm:text-2xl"
        >
          Где искать «{trimmedQuery}»
        </h2>
        <p className="text-sm text-black/50">{platformCountPhrase(totalActions)}</p>
      </header>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.groupId}>
            <h3 className="mb-3 text-sm font-semibold text-black/70">{group.groupTitle}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.actions.map((action) => (
                <li key={action.providerId}>
                  <ProviderGatewayCard action={action} query={trimmedQuery} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
