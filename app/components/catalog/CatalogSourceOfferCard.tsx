import Link from "next/link";
import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import { sourceOfferPublicPath } from "../../lib/catalogSourceOfferSeo";
import { resolveSourceOfferDisplayCity } from "../../lib/catalogSourceOfferDisplay";
import { SOURCE_OFFER_SNIPPET_MAX } from "../../lib/catalogSourceOfferNormalize";
import { SourceOfferCoverThumb, SourceOfferPriceDisplay } from "./SourceOfferDisplay";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";

export function CatalogSourceOfferCard({
  offer,
  displayCityFallback,
}: {
  offer: CatalogSourceOffer;
  displayCityFallback?: string;
}) {
  const snippet = offer.shortSnippet?.trim().slice(0, SOURCE_OFFER_SNIPPET_MAX) ?? "";
  const cityLabel = resolveSourceOfferDisplayCity(offer, displayCityFallback);
  const detailHref = offer.id ? sourceOfferPublicPath(offer.id) : null;

  const media = (
    <div className="relative shrink-0">
      <SourceOfferCoverThumb offer={offer} size="public" alt={offer.title} />
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
          {detailHref ?
            <h2 className="text-base font-semibold leading-snug text-black sm:text-lg">
              <Link href={detailHref} className="hover:text-[#ff7a00]">
                {offer.title}
              </Link>
            </h2>
          : <h2 className="text-base font-semibold leading-snug text-black sm:text-lg">{offer.title}</h2>}

          <p className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
            <SourceOfferPriceDisplay offer={offer} />
          </p>

          {cityLabel ?
            <p className="mt-2 text-sm font-medium text-black/60">{cityLabel}</p>
          : null}

          {snippet ?
            <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-black/55">{snippet}</p>
          : null}

          <div className="mt-4 flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            {detailHref ?
              <Link
                href={detailHref}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-black/10 px-4 text-sm font-semibold text-black/75 hover:bg-black/[0.03] sm:w-auto"
              >
                Подробнее
              </Link>
            : null}
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
