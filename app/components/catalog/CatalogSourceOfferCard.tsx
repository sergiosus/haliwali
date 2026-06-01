import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import {
  formatOfferImportedAt,
  formatOfferPriceDisplay,
} from "../../lib/catalogSourceOfferFormat";
import { SOURCE_OFFER_SNIPPET_MAX } from "../../lib/catalogSourceOfferNormalize";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";

export function CatalogSourceOfferCard({ offer }: { offer: CatalogSourceOffer }) {
  const snippet = offer.shortSnippet?.trim().slice(0, SOURCE_OFFER_SNIPPET_MAX) ?? "";
  const priceLabel = formatOfferPriceDisplay(offer.price);
  const importedLabel = formatOfferImportedAt(offer.importedAt);

  return (
    <article
      id={offer.id ? `offer-${offer.id}` : undefined}
      className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm"
    >
      <div className="relative aspect-[16/10] w-full shrink-0 bg-gradient-to-br from-black/[0.04] to-black/[0.08]">
        {offer.imageUrl ?
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-black/35">
            <span className="text-3xl" aria-hidden>
              📷
            </span>
            <span className="text-xs font-medium">Нет фото</span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-violet-900 shadow-sm">
          {catalogSourceNameLabel(offer.sourceName)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h2 className="text-base font-semibold leading-snug text-black sm:text-lg">{offer.title}</h2>

        {priceLabel ?
          <p className="mt-2 text-xl font-bold tracking-tight text-black sm:text-2xl">{priceLabel}</p>
        : (
          <p className="mt-2 text-sm text-black/40">Цена не указана</p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-black/55">
          {offer.city ?
            <span>{offer.city}</span>
          : null}
          {importedLabel ?
            <span className="text-black/45">· {importedLabel}</span>
          : null}
        </div>

        {offer.brand ?
          <p className="mt-1 text-xs text-black/45">Бренд: {offer.brand}</p>
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
    </article>
  );
}
