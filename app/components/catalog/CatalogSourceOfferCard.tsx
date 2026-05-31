import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import { SOURCE_OFFER_SNIPPET_MAX } from "../../lib/catalogSourceOfferNormalize";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";

export function CatalogSourceOfferCard({ offer }: { offer: CatalogSourceOffer }) {
  const snippet = offer.shortSnippet?.trim().slice(0, SOURCE_OFFER_SNIPPET_MAX) ?? "";

  return (
    <article
      id={offer.id ? `offer-${offer.id}` : undefined}
      className="flex flex-col rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-900">
          {catalogSourceNameLabel(offer.sourceName)}
        </span>
      </div>

      <h2 className="mt-2 text-base font-semibold leading-snug text-black">{offer.title}</h2>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-black/55">
        {offer.city ?
          <span>{offer.city}</span>
        : null}
        {offer.price ?
          <span className="font-medium text-black/75">{offer.price}</span>
        : null}
      </div>

      {snippet ?
        <p className="mt-2 line-clamp-3 text-sm text-black/55">{snippet}</p>
      : null}

      <div className="mt-4">
        <a
          href={offer.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-full bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:bg-[#f07000]"
        >
          Открыть источник
        </a>
      </div>
    </article>
  );
}
