import type { MarketplaceDisplayCard } from "../lib/marketplaceDisplay";
import { MarketplaceProductCard } from "./MarketplaceProductCard";
import { MarketplaceWebSearchFallback } from "./MarketplaceWebSearchFallback";

export function ExternalMarketplaceProductResults({
  loading,
  error,
  cards,
  query,
}: {
  loading: boolean;
  error: string | null;
  cards: MarketplaceDisplayCard[];
  query: string;
}) {
  const displayCards = cards;

  if (!loading && displayCards.length === 0) {
    if (!query.trim()) return null;
    return <MarketplaceWebSearchFallback query={query} />;
  }

  if (loading && displayCards.length === 0) {
    return null;
  }

  if (displayCards.length === 0) return null;

  return (
    <section
      id="external-marketplaces"
      className="mt-10 border-t border-gray-200 pt-6"
      aria-label="Товары с внешних площадок"
    >
      <h2 className="text-lg font-semibold text-black">Товары с внешних площадок</h2>
      <p className="mt-1 text-xs leading-snug text-black/50">
        Товары с внешних площадок — переход на сайт площадки только по кнопке «Открыть товар».
      </p>

      {error ?
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Часть площадок не ответила. Показаны доступные товары.
        </p>
      : null}

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {displayCards.map((card, idx) => (
          <li key={`${card.providerId}-${card.externalUrl}-${idx}`} className="min-h-0">
            <MarketplaceProductCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}
