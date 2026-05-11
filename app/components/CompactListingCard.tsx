"use client";

import Link from "next/link";
import type { Listing } from "../lib/listings";
import { formatListingCardAuthor } from "../lib/listingCardAuthorDisplay";
import {
  extractListingPhotos,
  formatListingCardDate,
  formatViewCountRu,
  listingCardLocationLine,
  listingDealStatusBadgeRu,
  listingPriceSnippet,
} from "../lib/listingCardMeta";
import { ListingFavoriteButton } from "./ListingFavoriteButton";

export function CompactListingCard({
  listing,
  href,
  viewCount = 0,
  publicAuthor,
  distanceLabel,
  variant = "link",
}: {
  listing: Listing;
  href: string;
  viewCount?: number;
  publicAuthor?: {
    displayName?: string;
    email?: string;
    name?: string;
    identityLabel?: string;
  } | null;
  /** e.g. «12 км от вас» — optional fourth meta segment before author. */
  distanceLabel?: string | null;
  /** `plain` — no in-card links; parent handles navigation (e.g. map modal). */
  variant?: "link" | "plain";
}) {
  const photos = extractListingPhotos(listing);
  const first = photos[0];
  const pub = listing;
  const title = (pub.title ?? "").trim() || "Объявление";
  const description = (pub.description ?? "").trim();
  const ts = pub.updatedAt ?? pub.createdAt;
  const isUrgent = `${pub.title} ${pub.description}`.toLowerCase().includes("срочно");

  const locationLine = listingCardLocationLine(listing);
  const category = (listing.categoryName ?? "").trim();
  const statusB = listingDealStatusBadgeRu(listing);
  const price = listingPriceSnippet(listing);

  const legacyAuthor = (listing as unknown as { authorName?: string }).authorName;
  const storedAuthor =
    typeof listing.authorPublicName === "string" && listing.authorPublicName.trim()
      ? listing.authorPublicName.trim()
      : typeof legacyAuthor === "string" && legacyAuthor.trim()
        ? legacyAuthor.trim()
        : undefined;
  const author = formatListingCardAuthor({
    ownerId: listing.ownerId,
    publicApi: publicAuthor ?? null,
    storedAuthorName: storedAuthor,
    debugListingMeta: {
      id: listing.id,
      ownerId: listing.ownerId,
      authorPublicName: listing.authorPublicName,
    },
  });

  const midMetaParts = [locationLine];
  if (category) midMetaParts.push(category);
  const midMeta = midMetaParts.join(" · ");

  const metaTailParts: string[] = [formatListingCardDate(ts), formatViewCountRu(viewCount)];
  const dist = distanceLabel?.trim();
  if (dist) metaTailParts.push(dist);
  metaTailParts.push(author);

  const thumbClass =
    "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-zinc-100 md:bg-black/[0.04] md:h-20 md:w-20";
  const titleClass =
    "min-w-0 flex-1 truncate text-left text-[15px] font-bold leading-snug tracking-tight text-black md:text-[16px]";

  const thumbnail =
    first ?
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={first}
        alt=""
        className="h-full w-full object-contain md:object-cover"
        loading="lazy"
      />
    : <div className="flex h-full w-full items-center justify-center bg-black/[0.06] px-1 text-center text-[11px] font-medium leading-tight text-black/45">
        Нет фото
      </div>;

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex gap-3">
        {variant === "link" ?
          <Link href={href} className={thumbClass}>
            {thumbnail}
          </Link>
        : <div className={thumbClass}>{thumbnail}</div>}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {variant === "link" ?
              <Link href={href} className={`${titleClass} hover:underline`}>
                {title}
              </Link>
            : <div className={`${titleClass} cursor-default`}>{title}</div>}
            <div className="mt-0.5 shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
              <ListingFavoriteButton listingId={listing.id} />
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-black/55">
            <span>{statusB}</span>
            {isUrgent ? (
              <>
                <span className="text-black/30">·</span>
                <span className="font-semibold text-red-600">СРОЧНО</span>
              </>
            ) : null}
          </div>

          <div className="mt-0.5 truncate text-[12px] text-black/55" title={midMeta}>
            {midMeta}
            {price ? (
              <>
                <span className="text-black/30"> · </span>
                <span className="font-medium text-black/70">{price}</span>
              </>
            ) : null}
          </div>

          {description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-black/55">{description}</p>
          ) : null}

          <div className="mt-1.5 truncate text-[12px] text-black/50" title={metaTailParts.join(" · ")}>
            {metaTailParts.join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}
