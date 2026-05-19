import type { ExternalSearchResultItem } from "../lib/externalSearch";

export function ExternalSearchResults({ items }: { items: ExternalSearchResultItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold text-black">Другие источники</h2>
      <p className="mt-1 text-sm text-black/55">
        Ссылки ведут на внешние официальные или партнёрские площадки. Haliwali не копирует их объявления.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item, idx) => (
          <li
            key={`${item.externalUrl}-${idx}`}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <p className="font-medium text-black">{item.title}</p>
            <p className="mt-0.5 text-xs text-black/50">{item.sourceName}</p>
            {item.snippet ?
              <p className="mt-2 line-clamp-2 text-sm text-black/70">{item.snippet}</p>
            : null}
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-orange-600 hover:underline"
            >
              Открыть источник
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
