import type { Listing } from "../lib/listings";
import { listingTypeBadgeRu } from "../lib/listingCardMeta";

const pillClass =
  "inline-flex shrink-0 items-center rounded-full border border-black/10 bg-black/[0.03] px-1.5 py-0.5 text-[10px] font-medium leading-none text-black/70";

export function ListingTypeBadge({ type, className }: { type: Listing["type"] | string | undefined; className?: string }) {
  return <span className={className ? `${pillClass} ${className}` : pillClass}>{listingTypeBadgeRu(type)}</span>;
}
