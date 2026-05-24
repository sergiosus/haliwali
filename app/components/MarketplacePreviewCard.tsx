"use client";

import { useState } from "react";
import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";
import { findGatewayProvider } from "../lib/marketplaceProviderGateway";

export const marketplacePreviewGridClassName =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

export function MarketplacePreviewCard({ card }: { card: MarketplaceDisplayCard }) {
  const [imageOk, setImageOk] = useState(true);
  const title = card.titleDisplay || card.title;
  const price = card.priceDisplay;
  const source = card.sourceNameRu || card.sourceName;
  const visual = getMarketplaceChipVisual(card.providerId);
  const gateway = findGatewayProvider(card.providerId);
  const shippingLine = card.snippetDisplay || gateway?.deliveryNote || null;

  if (!card.imageUrl || !imageOk) return null;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gradient-to-b from-zinc-50 to-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
        />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-black/75 shadow-sm backdrop-blur-sm">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-md text-[7px] font-bold text-white"
            style={{ backgroundColor: visual.brandColor }}
            aria-hidden="true"
          >
            {visual.abbr}
          </span>
          <span className="max-w-[5.5rem] truncate">{source}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-black sm:text-[15px]">
          {title}
        </h3>
        {price ?
          <p className="mt-1.5 text-base font-bold tracking-tight text-black">{price}</p>
        : null}
        {shippingLine ?
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-black/45">{shippingLine}</p>
        : null}
        <a
          href={card.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#ff7a00] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#f07000] active:bg-[#e56800]"
        >
          Смотреть товар
        </a>
      </div>
    </article>
  );
}
