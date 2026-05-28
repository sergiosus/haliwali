"use client";

import { useRouter } from "next/navigation";
import { CompactListingCard } from "../CompactListingCard";
import { listingPath } from "../../lib/seo";
import type { Listing } from "../../lib/listingModel";

export function SeoListingCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const href = listingPath(listing.id, listing.title);
  const title = (listing.title ?? "").trim() || "Объявление";

  function openListing() {
    router.push(href);
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={title}
      className="cursor-pointer rounded-2xl transition-shadow hover:shadow-md focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#ff7a00] focus-visible:ring-offset-1"
      onClick={openListing}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openListing();
        }
      }}
    >
      <div className="pointer-events-none">
        <CompactListingCard listing={listing} href={href} variant="plain" interactiveChrome />
      </div>
    </div>
  );
}
