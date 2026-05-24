"use client";

import { useState } from "react";
import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { getMarketplaceChipVisual } from "../lib/marketplaceDiscoveryContent";

export const marketplacePreviewGridClassName =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function MarketplacePreviewCard({ card }: { card: MarketplaceDisplayCard }) {
  const [imageOk, setImageOk] = useState(true);
  const title = card.titleDisplay || card.title;
  const price = card.priceDisplay;
  const source = card.sourceNameRu || card.sourceName;
  const visual = getMarketplaceChipVisual(card.providerId);

  if (!card.imageUrl || !imageOk) return null;

  return (
    <article className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(0,0,0,0.1)]">
      <div className="relative aspect-[5/4] w-full shrink-0 overflow-hidden bg-zinc-100 sm:aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
        />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-black/80 shadow-md backdrop-blur-sm">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: visual.brandColor }}
            aria-hidden="true"
          >
            {visual.abbr}
          </span>
          {source}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-black sm:text-lg">{title}</h3>
        {price ?
          <p className="mt-2 text-xl font-extrabold tracking-tight text-black">{price}</p>
        : null}
        <a
          href={card.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#ff7a00] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#f07000] active:bg-[#e56800]"
        >
          Смотреть товар
        </a>
      </div>
    </article>
  );
}
