import Link from "next/link";
import type { CatalogCategory } from "../../lib/catalogTypes";
import { catalogCategoryVisual } from "../../lib/catalogVisual";

export function CatalogCategoryGrid({ categories }: { categories: readonly CatalogCategory[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) => {
        const visual = catalogCategoryVisual(cat.iconKey);
        return (
          <Link
            key={cat.slug}
            href={`/catalogs/${cat.slug}`}
            className="group flex gap-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200/40 hover:shadow-md"
          >
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-bold text-white shadow-sm ${visual.gradient}`}
            >
              {visual.glyph}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-black group-hover:text-[#c25a00]">{cat.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-black/50">{cat.subtitle}</p>
              <p className="mt-2 text-xs font-medium text-black/40">
                {cat.companyCount}{" "}
                {cat.companyCount === 1 ? "компания" : cat.companyCount < 5 ? "компании" : "компаний"}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
