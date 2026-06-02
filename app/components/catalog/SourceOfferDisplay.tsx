"use client";

import type { ReactNode } from "react";
import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import { displaySourceOfferPrice } from "../../lib/catalogOfferPrice";
import { resolveCoverImageUrl } from "../../lib/catalogSourceOfferCoverImage";
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

export function SourceOfferPriceDisplay({
  offer,
  className = "",
}: {
  offer: Pick<OfferLike, "price" | "priceAmount" | "priceText">;
  className?: string;
}) {
  const label = displaySourceOfferPrice(offer);
  if (label) {
    return <span className={["font-semibold text-black", className].filter(Boolean).join(" ")}>{label}</span>;
  }
  return <span className={["text-black/40", className].filter(Boolean).join(" ")}>Цена не указана</span>;
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
          alt={(alt ?? offer.title ?? "").trim() || "Фото предложения"}
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
    <div className={`${placeholder} shrink-0 rounded-lg border border-dashed border-black/10 bg-black/[0.02]`}>
      <span className="text-[10px] font-medium text-black/30">Без фото</span>
    </div>
  );
}

export function SourceOfferModerationCardBody({
  offer,
  meta,
  children,
}: {
  offer: OfferLike;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-black">{offer.title}</span>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-900">
          {catalogSourceNameLabel(offer.sourceName)}
        </span>
        {meta}
      </div>
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
    </div>
  );
}
