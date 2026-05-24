"use client";

import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import {
  MarketplacePreviewCard,
  marketplacePreviewGridClassName,
} from "./MarketplacePreviewCard";

const PREVIEW_SKELETON_COUNT = 4;

function PreviewCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
      <div className="aspect-[5/4] animate-pulse bg-black/[0.04] sm:aspect-[4/3]" />
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-full animate-pulse rounded-lg bg-black/[0.06]" />
        <div className="h-4 w-3/4 animate-pulse rounded-lg bg-black/[0.06]" />
        <div className="h-7 w-1/3 animate-pulse rounded-lg bg-black/[0.06]" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-black/[0.06]" />
      </div>
    </div>
  );
}

export function MarketplacePreviewSection({
  query,
  items,
  loading,
}: {
  query: string;
  items: readonly MarketplaceDisplayCard[];
  loading: boolean;
}) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (!loading && items.length === 0) return null;

  const visibleItems = items.filter((c) => Boolean(c.imageUrl));

  return (
    <section
      className="space-y-4"
      aria-labelledby="marketplace-preview-heading"
      aria-busy={loading}
    >
      <h2
        id="marketplace-preview-heading"
        className="text-xl font-extrabold tracking-tight text-black sm:text-2xl"
      >
        Популярные предложения
      </h2>

      {loading ?
        <div className={marketplacePreviewGridClassName}>
          {Array.from({ length: PREVIEW_SKELETON_COUNT }).map((_, i) => (
            <PreviewCardSkeleton key={i} />
          ))}
        </div>
      : (
        <div className={marketplacePreviewGridClassName}>
          {visibleItems.map((card) => (
            <MarketplacePreviewCard key={`${card.providerId}-${card.externalUrl}`} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
