import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import { resolveSourceOfferDisplayCity } from "../../lib/catalogSourceOfferDisplay";
import { displaySourceOfferPrice } from "../../lib/catalogOfferPrice";
import { SOURCE_OFFER_SNIPPET_MAX } from "../../lib/catalogSourceOfferNormalize";
import { resolveCoverImageUrl } from "../../lib/catalogSourceOfferCoverImage";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";

export function CatalogSourceOfferCard({
  offer,
  displayCityFallback,
}: {
  offer: CatalogSourceOffer;
  displayCityFallback?: string;
}) {
  const snippet = offer.shortSnippet?.trim().slice(0, SOURCE_OFFER_SNIPPET_MAX) ?? "";
  const priceLabel = displaySourceOfferPrice(offer);
  const cityLabel = resolveSourceOfferDisplayCity(offer, displayCityFallback);
  const cover = resolveCoverImageUrl({
    coverImageUrl: offer.coverImageUrl,
    imageUrl: offer.imageUrl,
  });

  const media = cover ?
    <div className="relative h-[120px] w-full shrink-0 overflow-hidden rounded-xl bg-black/[0.04] sm:h-[120px] sm:w-[180px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-violet-900 shadow-sm sm:text-xs">
        {catalogSourceNameLabel(offer.sourceName)}
      </span>
    </div>
  : (
    <div className="relative flex h-[72px] max-h-[120px] w-full shrink-0 items-center justify-center rounded-xl border border-dashed border-black/10 bg-black/[0.02] sm:h-[120px] sm:w-[180px]">
      <span className="text-[10px] font-medium text-black/30 sm:text-xs">Без фото</span>
      <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-violet-900 shadow-sm sm:text-xs">
        {catalogSourceNameLabel(offer.sourceName)}
      </span>
    </div>
  );

  return (
    <article
      id={offer.id ? `offer-${offer.id}` : undefined}
      className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="max-h-[160px] shrink-0 p-3 pb-0 sm:max-h-none sm:p-4 sm:pr-0">{media}</div>

        <div className="flex min-w-0 flex-1 flex-col p-4 pt-3 sm:pt-4">
          <h2 className="text-base font-semibold leading-snug text-black sm:text-lg">{offer.title}</h2>

          {priceLabel ?
            <p className="mt-2 text-xl font-bold tracking-tight text-black sm:text-2xl">{priceLabel}</p>
          : (
            <p className="mt-2 text-xs text-black/40">Цена не указана</p>
          )}

          {cityLabel ?
            <p className="mt-2 text-sm font-medium text-black/60">{cityLabel}</p>
          : null}

          {snippet ?
            <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-black/55">{snippet}</p>
          : null}

          <div className="mt-4 pt-1">
            <a
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:bg-[#f07000] sm:w-auto"
            >
              Открыть объявление
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
