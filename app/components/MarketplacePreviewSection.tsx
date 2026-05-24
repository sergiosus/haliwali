"use client";

import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import {
  MarketplacePreviewCard,
  marketplacePreviewGridClassName,
} from "./MarketplacePreviewCard";

const PREVIEW_SKELETON_COUNT = 4;

function PreviewCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
      <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-black/[0.04] to-black/[0.02]" />
      <div className="space-y-2 p-3.5">
        <div className="h-3.5 w-full animate-pulse rounded-full bg-black/[0.06]" />
        <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-black/[0.06]" />
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-black/[0.06]" />
        <div className="mt-2 h-10 w-full animate-pulse rounded-xl bg-black/[0.06]" />
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
    <section className="space-y-4" aria-labelledby="marketplace-preview-heading" aria-busy={loading}>
      <header className="space-y-1">
        <h2 id="marketplace-preview-heading" className="text-lg font-bold tracking-tight text-black sm:text-xl">
          Популярные предложения
        </h2>
        <p className="text-sm text-black/50">
          Несколько реальных предложений по запросу «{trimmed}»
        </p>
      </header>

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
