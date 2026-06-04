"use client";

import type { ReactNode } from "react";
import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import { resolveCoverImageUrl } from "../../lib/catalogSourceOfferCoverImage";
import {
  canPublishSourceOffer,
  sourceOfferAdminSlugDebugLine,
  sourceOfferCardDataLevel,
  sourceOfferCardStatusLabel,
  sourceOfferDisplayTitle,
  SOURCE_OFFER_TITLE_MISSING,
  SOURCE_OFFER_TITLE_MISSING_HINT,
  type SourceOfferCardFields,
} from "../../lib/catalogSourceOfferCardUi";
import { SourceOfferPriceDisplay } from "./SourceOfferPriceDisplay";
import type { CatalogSourceOffer, CatalogSourceOfferDraft } from "../../lib/catalogSourceOfferTypes";

type OfferLike = Pick<
  CatalogSourceOffer | CatalogSourceOfferDraft,
  | "title"
  | "price"
  | "priceAmount"
  | "priceText"
  | "city"
  | "sourceName"
  | "sourceUrl"
  | "coverImageUrl"
  | "shortSnippet"
  | "brand"
  | "oemCodes"
  | "articleCodes"
  | "companyName"
  | "sellerName"
> & { rawPayload?: Record<string, unknown>; imageUrl?: string | null };

export { SourceOfferPriceDisplay } from "./SourceOfferPriceDisplay";

export function SourceOfferCardStatusBadge({ offer }: { offer: SourceOfferCardFields }) {
  const level = sourceOfferCardDataLevel(offer);
  const full = level === "full";
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        full ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900",
      ].join(" ")}
    >
      {sourceOfferCardStatusLabel(level)}
    </span>
  );
}

export function SourceOfferTitleBlock({
  offer,
  showSlugDebug = false,
  titleClassName = "font-semibold text-black",
}: {
  offer: SourceOfferCardFields;
  showSlugDebug?: boolean;
  titleClassName?: string;
}) {
  const titleDisplay = sourceOfferDisplayTitle(offer);
  const missing = titleDisplay === SOURCE_OFFER_TITLE_MISSING;
  const slugLine = showSlugDebug ? sourceOfferAdminSlugDebugLine(offer) : null;

  return (
    <div className="min-w-0">
      <span className={titleClassName}>{titleDisplay}</span>
      {missing ?
        <p className="mt-0.5 text-xs text-black/40">{SOURCE_OFFER_TITLE_MISSING_HINT}</p>
      : null}
      {slugLine ?
        <p className="mt-0.5 font-mono text-[10px] text-black/35">{slugLine}</p>
      : null}
    </div>
  );
}

export function SourceOfferCoverThumb({
  offer,
  size = "admin",
  alt,
}: {
  offer: Pick<OfferLike, "coverImageUrl" | "rawPayload" | "imageUrl" | "title">;
  size?: "admin" | "public";
  alt?: string;
}) {
  const cover = resolveCoverImageUrl({
    coverImageUrl: offer.coverImageUrl,
    imageUrl: offer.imageUrl,
    rawPayload: offer.rawPayload,
  });
  const altText = (alt ?? sourceOfferDisplayTitle(offer) ?? "").trim() || "Фото предложения";

  if (cover) {
    const box =
      size === "public" ?
        "h-[120px] w-full max-w-[180px] sm:w-[180px]"
      : "h-20 w-[120px] max-h-[80px]";
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-lg bg-black/[0.04] ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={altText}
          className="h-full w-full object-cover"
          width={size === "public" ? 180 : 120}
          height={size === "public" ? 120 : 80}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  const placeholder =
    size === "public" ?
      "flex h-[72px] max-h-[120px] w-full max-w-[180px] items-center justify-center sm:h-[120px] sm:w-[180px]"
    : "flex h-16 w-[120px] max-h-[80px] items-center justify-center";
  return (
    <div className={`${placeholder} shrink-0 rounded-lg border border-dashed border-black/10 bg-[#fff8f3] text-center`}>
      <span className="px-1 text-[10px] font-medium leading-tight text-black/45">📷 Фото загружается</span>
    </div>
  );
}

export function SourceOfferModerationCardBody({
  offer,
  meta,
  children,
  titleEditor,
}: {
  offer: OfferLike;
  meta?: ReactNode;
  children?: ReactNode;
  titleEditor?: ReactNode;
}) {
  const publishable = canPublishSourceOffer(offer);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start gap-2">
        <SourceOfferTitleBlock offer={offer} />
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-900">
          {catalogSourceNameLabel(offer.sourceName)}
        </span>
        <SourceOfferCardStatusBadge offer={offer} />
        {meta}
      </div>
      {titleEditor}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <SourceOfferPriceDisplay offer={offer} />
        {offer.city ?
          <span className="text-black/55">{offer.city}</span>
        : null}
      </p>
      {(offer.companyName || offer.sellerName) ?
        <p className="mt-1 text-xs text-black/50">
          {offer.companyName ? `Компания: ${offer.companyName}` : ""}
          {offer.companyName && offer.sellerName ? " · " : ""}
          {offer.sellerName ? `Продавец: ${offer.sellerName}` : ""}
        </p>
      : null}
      {offer.shortSnippet ?
        <p className="mt-1 line-clamp-2 text-black/45">{offer.shortSnippet}</p>
      : null}
      {(offer.brand || (offer.oemCodes?.length ?? 0) > 0 || (offer.articleCodes?.length ?? 0) > 0) ?
        <p className="mt-1 text-xs text-black/40">
          {offer.brand ? `Бренд: ${offer.brand}` : ""}
          {(offer.oemCodes?.length ?? 0) > 0 ? ` · OEM: ${offer.oemCodes!.join(", ")}` : ""}
          {(offer.articleCodes?.length ?? 0) > 0 ? ` · Арт.: ${offer.articleCodes!.join(", ")}` : ""}
        </p>
      : null}
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block break-all text-xs font-medium text-[#c25a00] underline"
      >
        {offer.sourceUrl}
      </a>
      {children}
      {!publishable && children ?
        <p className="mt-1 text-[11px] text-black/45">
          Для публикации укажите название вручную или дозагрузите с площадки; также нужны город и цена или фото
        </p>
      : null}
    </div>
  );
}
