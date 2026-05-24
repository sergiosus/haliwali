import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { MarketplaceProductCard } from "./MarketplaceProductCard";

export function MarketplaceSuggestRow({ card }: { card: MarketplaceDisplayCard }) {
  return (
    <div
      className="transition-colors hover:bg-orange-50"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MarketplaceProductCard card={card} compact />
    </div>
  );
}
