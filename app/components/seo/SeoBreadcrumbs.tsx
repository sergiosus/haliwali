import Link from "next/link";

export function SeoBreadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="text-sm text-black/45" aria-label="Хлебные крошки">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={item.path}>
            {index > 0 ? <span className="mx-1.5">/</span> : null}
            {last ?
              <span className="text-black/70">{item.name}</span>
            : <Link href={item.path} className="hover:text-black/70">
                {item.name}
              </Link>
            }
          </span>
        );
      })}
    </nav>
  );
}
