import Link from "next/link";
import type { SeoCategoryPageData } from "../../lib/seoCategoryPageData";
import { introForSeoCategoryPage } from "../../lib/seoCategoryPageData";
import { buildMapBrowseHref, mapKindFromSeoSegment } from "../../lib/seoMapBrowseHref";
import { seoCategoryBreadcrumbs } from "../../lib/seoSchema";
import { JsonLdScript } from "./JsonLdScript";
import { SeoBreadcrumbs } from "./SeoBreadcrumbs";
import { SeoCompanyList } from "./SeoCompanyList";
import { SeoListingGrid } from "./SeoListingGrid";

export function SeoCategoryPageView({ data }: { data: SeoCategoryPageData }) {
  const intro = introForSeoCategoryPage(data);
  const crumbs = seoCategoryBreadcrumbs(
    data.item,
    data.segment,
    data.urlSlug,
    data.cityName,
    data.citySlug,
  );

  const mapHref = buildMapBrowseHref({
    categorySlug: data.item.slug,
    cityName: data.cityName,
    kind: mapKindFromSeoSegment(data.segment),
  });

  const cityLink =
    data.citySlug && data.cityName ?
      <Link href={`/${data.citySlug}`} className="text-sm text-[#ff7a00] hover:underline">
        Все категории в {data.cityName}
      </Link>
    : null;

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <JsonLdScript data={data.jsonLd} />
      <main className="mx-auto w-full max-w-[900px] px-4 pb-16 sm:px-6">
        <div className="py-4" />
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <SeoBreadcrumbs items={crumbs} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {data.item.title}
              {data.cityName ? ` в ${data.cityName}` : ""}
            </h1>
            <Link
              href={mapHref}
              className="inline-flex items-center rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-black/[0.03]"
            >
              На карте
            </Link>
          </div>
          <p className="text-sm leading-relaxed text-black/55">{intro}</p>
          {cityLink}
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Объявления</h2>
          <SeoListingGrid listings={data.listings} />
        </section>

        <div className="mt-8">
          <SeoCompanyList companies={data.companies} />
        </div>

        {!data.citySlug ?
          <p className="mt-8 text-center text-xs text-black/40">
            Ищете в другом городе? Откройте{" "}
            <Link href="/" className="text-[#ff7a00] hover:underline">
              главную
            </Link>{" "}
            и выберите населённый пункт.
          </p>
        : null}
      </main>
    </div>
  );
}
