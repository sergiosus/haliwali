"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth";
import type { Listing } from "../lib/listings";
import {
  extractListingPhotos,
  formatListingCardDate,
  formatViewCountRu,
  listingCardLocationLine,
  listingDealStatusBadgeRu,
  listingPriceSnippet,
} from "../lib/listingCardMeta";
import { ListingAuthorLine } from "./ListingAuthorLine";
import { ListingFavoriteButton } from "./ListingFavoriteButton";
import { ListingTypeBadge } from "./ListingTypeBadge";
import { ListingAttributesCompactLine } from "./ListingAttributesSummary";

export function CompactListingCard({
  listing,
  href,
  viewCount = 0,
  publicAuthor,
  distanceLabel,
  variant = "link",
  interactiveChrome = false,
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
  /** Favorite control stays clickable when parent uses a full-card overlay link. */
  interactiveChrome?: boolean;
}) {
  const auth = useAuth();
  const currentUserId = auth.status === "ready" ? (auth.userId ?? "").trim() : "";
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
  const midMetaParts = [locationLine];
  if (category) midMetaParts.push(category);
  const midMeta = midMetaParts.join(" · ");

  const metaTailParts: string[] = [formatListingCardDate(ts), formatViewCountRu(viewCount)];
  const dist = distanceLabel?.trim();
  if (dist) metaTailParts.push(dist);

  const thumbClass =
    "relative flex h-[4.5rem] w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-zinc-100 md:h-24 md:w-20 md:bg-black/[0.04]";
  const titleClass =
    "min-w-0 flex-1 truncate text-left text-[15px] font-bold leading-snug tracking-tight text-black md:text-[16px]";

  const thumbnail =
    first ?
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={first}
        alt=""
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    : <div className="flex h-full w-full items-center justify-center bg-black/[0.06] px-1 text-center text-[11px] font-medium leading-tight text-black/45">
        Нет фото
      </div>;

  return (
    <div className="relative max-w-full min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4">
      {variant === "link" ? (
        <Link href={href} className="absolute inset-0 z-0 rounded-2xl" aria-label={title} />
      ) : null}

      <div className="relative z-[1] pointer-events-none flex min-w-0 max-w-full gap-3">
        <div className={thumbClass}>{thumbnail}</div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className={variant === "link" ? titleClass : `${titleClass} cursor-default`}>{title}</div>
            <div
              className={[
                "mt-0.5 shrink-0 self-start pointer-events-auto relative z-[2]",
                interactiveChrome ? "pointer-events-auto" : "",
              ].join(" ")}
              onClick={(e) => e.stopPropagation()}
            >
              <ListingFavoriteButton listingId={listing.id} />
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-black/55">
            <ListingTypeBadge type={listing.type} />
            <span className="text-black/30">·</span>
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

          <ListingAttributesCompactLine listing={listing} className="mt-1 line-clamp-1 text-[12px] text-black/50" />

          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[12px] text-black/50">
            <span className="min-w-0 truncate">{metaTailParts.join(" · ")}</span>
            <div className="flex shrink-0 items-center gap-2">
              <ListingAuthorLine
                ownerId={listing.ownerId}
                currentUserId={currentUserId}
                publicApi={publicAuthor ?? null}
                storedAuthorName={storedAuthor}
                nameClassName="font-medium text-black/65"
                linkClassName="font-medium text-orange-600 hover:text-orange-700 hover:underline"
                debugListingMeta={{
                  id: listing.id,
                  ownerId: listing.ownerId,
                  authorPublicName: listing.authorPublicName,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
