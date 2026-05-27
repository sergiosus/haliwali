import Link from "next/link";
import type { CatalogCompanyListItem } from "../../lib/catalogTypes";
import { companyPublicPath } from "../../lib/seoRoutes";
import { catalogCategoryVisual } from "../../lib/catalogVisual";

export function SeoCompanyList({ companies, heading = "Компании" }: { companies: CatalogCompanyListItem[]; heading?: string }) {
  if (companies.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {companies.map((company) => {
          const visual = catalogCategoryVisual(company.categorySlug);
          return (
            <li key={company.slug}>
              <Link
                href={companyPublicPath(company.slug)}
                className="flex gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                {company.logoUrl ?
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-zinc-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                : <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${visual.gradient}`}
                  >
                    {company.name.charAt(0).toUpperCase()}
                  </div>
                }
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">{company.name}</div>
                  <div className="mt-0.5 text-xs text-black/45">
                    {[company.categoryTitle, company.city].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
