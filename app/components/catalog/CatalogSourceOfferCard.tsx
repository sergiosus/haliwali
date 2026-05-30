import { catalogSourceNameLabel } from "../../lib/catalogSourceName";
import type { CatalogSourceOffer } from "../../lib/catalogSourceOfferTypes";

export function CatalogSourceOfferCard({ offer }: { offer: CatalogSourceOffer }) {
  const seller = offer.companyName || offer.sellerName;
  const codes = [...offer.oemCodes, ...offer.articleCodes].slice(0, 4);

  return (
    <article
      id={offer.id ? `offer-${offer.id}` : undefined}
      className="flex flex-col rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-900">
          {catalogSourceNameLabel(offer.sourceName)}
        </span>
        <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-xs text-black/50">
          Найдено в источнике
        </span>
      </div>

      <h2 className="mt-2 text-base font-semibold leading-snug text-black">{offer.title}</h2>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-black/55">
        {seller ?
          <span>{seller}</span>
        : null}
        {offer.city ?
          <span>{offer.city}</span>
        : null}
        {offer.price ?
          <span className="font-medium text-black/75">{offer.price}</span>
        : null}
      </div>

      {offer.brand || codes.length > 0 ?
        <p className="mt-2 text-xs text-black/45">
          {offer.brand ? `Бренд: ${offer.brand}` : null}
          {offer.brand && codes.length > 0 ? " · " : null}
          {codes.length > 0 ? `OEM/арт.: ${codes.join(", ")}` : null}
        </p>
      : null}

      {offer.shortSnippet ?
        <p className="mt-2 line-clamp-3 text-sm text-black/55">{offer.shortSnippet}</p>
      : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={offer.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-full bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:bg-[#f07000]"
        >
          Открыть источник
        </a>
      </div>

      <p className="mt-3 text-xs text-black/35">
        Материал проиндексирован по ссылке на внешний источник. Это не объявление пользователя Haliwali.
      </p>
    </article>
  );
}
