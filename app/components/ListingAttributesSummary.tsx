import { listingAttributeDisplayLines } from "../lib/listingAttributes";
import type { Listing } from "../lib/listingModel";

export function ListingAttributesSummary({
  listing,
  className = "text-xs text-black/55",
}: {
  listing: Pick<Listing, "attributes" | "categoryName" | "categorySlug" | "type">;
  className?: string;
}) {
  const lines = listingAttributeDisplayLines(listing);
  if (!lines.length) return null;

  return (
    <div className={className}>
      {lines.map((line) => (
        <span key={line.label} className="mr-2 inline">
          <span className="text-black/45">{line.label}:</span> {line.value}
        </span>
      ))}
    </div>
  );
}

export function ListingAttributesCompactLine({
  listing,
  className = "text-xs text-black/50",
}: {
  listing: Pick<Listing, "attributes" | "categoryName" | "categorySlug" | "type">;
  className?: string;
}) {
  const lines = listingAttributeDisplayLines(listing);
  if (!lines.length) return null;
  const text = lines
    .slice(0, 4)
    .map((l) => `${l.label}: ${l.value}`)
    .join(" · ");
  return <div className={className}>{text}</div>;
}
