import { getExternalMarketplaceSearchLinks } from "../lib/externalSearchLinks";

export function MarketplaceWebSearchFallback({ query }: { query: string }) {
  const links = getExternalMarketplaceSearchLinks(query);
  if (links.length === 0) return null;

  return (
    <section
      className="mt-8 border-t border-gray-200 pt-6"
      aria-label="Поиск на маркетплейсах"
    >
      <h2 className="text-sm font-semibold text-black">Поиск на маркетплейсах</h2>
      <p className="mt-1 text-xs leading-snug text-black/50">
        По этому запросу нет карточек товаров с площадок. Можно продолжить поиск в интернете.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-black/85 transition-colors hover:border-orange-300 hover:bg-orange-50"
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
