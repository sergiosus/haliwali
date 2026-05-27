import Link from "next/link";
import { CompactListingCard } from "../CompactListingCard";
import { listingPath } from "../../lib/seo";
import type { Listing } from "../../lib/listingModel";

export function SeoListingGrid({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return (
      <p className="rounded-2xl border border-black/[0.06] bg-white px-4 py-8 text-center text-sm text-black/50">
        Пока нет объявлений в этой категории. Загляните позже или посмотрите соседние разделы.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {listings.map((listing) => (
        <li key={listing.id}>
          <CompactListingCard listing={listing} href={listingPath(listing.id, listing.title)} />
        </li>
      ))}
    </ul>
  );
}

export function SeoListingGridClientHint() {
  return (
    <p className="text-xs text-black/40">
      <Link href="/post" className="underline-offset-2 hover:underline">
        Разместить объявление
      </Link>
    </p>
  );
}
