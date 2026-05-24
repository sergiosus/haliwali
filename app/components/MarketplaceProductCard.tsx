"use client";

import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";
import { findGatewayProvider } from "../lib/marketplaceProviderGateway";

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

const PRODUCT_GRID =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5";

export const marketplaceProductGridClassName = PRODUCT_GRID;

export function MarketplaceProductCard({
  card,
  compact = false,
}: {
  card: MarketplaceDisplayCard;
  /** Compact row for homepage suggest dropdown. */
  compact?: boolean;
}) {
  const title = card.titleDisplay || card.title;
  const price = card.priceDisplay;
  const source = card.sourceNameRu || card.sourceName;
  const visual = getMarketplaceChipVisual(card.providerId);
  const gateway = findGatewayProvider(card.providerId);

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2">
        {card.imageUrl ?
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        : null}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-black/90">{title}</p>
          {price ?
            <p className="mt-0.5 text-xs font-semibold text-black/75">{price}</p>
          : null}
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-black/45">
            <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5">{source}</span>
            <ExternalLinkIcon className="h-3 w-3 shrink-0" />
          </p>
        </div>
        <a
          href={card.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black/75 transition-colors hover:border-orange-300 hover:bg-orange-50"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Открыть
        </a>
      </div>
    );
  }

  if (!card.imageUrl) return null;

  return (
    <article className="group flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-200/50 hover:shadow-lg">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gradient-to-b from-black/[0.02] to-black/[0.04]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-black/70 shadow-sm backdrop-blur-sm">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-white"
            style={{ backgroundColor: visual.brandColor }}
            aria-hidden="true"
          >
            {visual.abbr}
          </span>
          <span>{source}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-snug tracking-tight text-black">
          {title}
        </h3>
        {price ?
          <p className="mt-2 text-base font-bold text-black">{price}</p>
        : (
          <p className="mt-2 min-h-[1.5rem] text-sm text-transparent" aria-hidden="true">
            —
          </p>
        )}
        {gateway ?
          <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-black/45">
            <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5">{gateway.regionLabel}</span>
            <span className="line-clamp-1">{gateway.deliveryNote}</span>
          </p>
        : null}
        <a
          href={card.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-auto inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#ff7a00] text-sm font-semibold text-white transition-colors hover:bg-[#f07000] active:bg-[#e56800]"
        >
          Открыть товар
        </a>
      </div>
    </article>
  );
}
