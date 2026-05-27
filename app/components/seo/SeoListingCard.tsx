"use client";

import Link from "next/link";
import { CompactListingCard } from "../CompactListingCard";
import { listingPath } from "../../lib/seo";
import { listingHasSeoMapButton } from "../../lib/seoCardMapCoords";
import { buildMapListingFocusHref } from "../../lib/seoMapBrowseHref";
import type { Listing } from "../../lib/listingModel";
import { SeoCardMapButton } from "./SeoCardMapButton";

export function SeoListingCard({ listing }: { listing: Listing }) {
  const href = listingPath(listing.id, listing.title);
  const title = (listing.title ?? "").trim() || "Объявление";
  const mapHref = listingHasSeoMapButton(listing) ? buildMapListingFocusHref(listing.id) : null;

  return (
    <div className="relative">
      <Link href={href} className="absolute inset-0 z-0 rounded-2xl" aria-label={title} tabIndex={-1} />
      <div className="relative z-[1] pointer-events-none">
        <CompactListingCard listing={listing} href={href} variant="plain" interactiveChrome />
      </div>
      {mapHref ?
        <div className="relative z-[2] flex justify-end px-3 pb-3 pt-0">
          <SeoCardMapButton href={mapHref} />
        </div>
      : null}
    </div>
  );
}
