import Link from "next/link";
import type { SeoCityPageData } from "../../lib/seoCityPageData";
import { introForSeoCityPage } from "../../lib/seoCityPageData";
import { seoCityBreadcrumbs } from "../../lib/seoSchema";
import { companyPublicPath } from "../../lib/seoRoutes";
import { listingPath } from "../../lib/seo";
import { hasCatalogCoordinates } from "../../lib/catalogMapLinks";
import { listingMarkerPlacemarkCoordinates } from "../../lib/searchScopeLocation";
import { JsonLdScript } from "./JsonLdScript";
import { SeoBreadcrumbs } from "./SeoBreadcrumbs";
import { SeoCompanyList } from "./SeoCompanyList";
import { SeoListingGrid } from "./SeoListingGrid";
import { SeoMapSectionClient } from "./SeoMapSectionClient";

export function SeoCityPageView({ data }: { data: SeoCityPageData }) {
  const intro = introForSeoCityPage(data);
  const crumbs = seoCityBreadcrumbs(data.cityName, data.citySlug);
  const mapCenter = data.mapCenter ?? { lat: 55.7558, lng: 37.6173 };

  const mapMarkers = [
    ...data.listings.flatMap((l) => {
      const c = listingMarkerPlacemarkCoordinates(l);
      if (!c) return [];
      return [
        {
          id: `l-${l.id}`,
          lat: c.lat,
          lng: c.lng,
          previewTitle: l.title,
          previewType: l.type === "task" ? "Задача" : l.type === "service" ? "Услуга" : "Товар",
          previewCity: l.city ?? "",
          href: listingPath(l.id, l.title),
        },
      ];
    }),
    ...data.companies.flatMap((co) => {
      if (!hasCatalogCoordinates(co)) return [];
      return [
        {
          id: `c-${co.slug}`,
          lat: co.latitude as number,
          lng: co.longitude as number,
          previewTitle: co.name,
          previewType: "Компания",
          previewCity: co.city ?? "",
          href: companyPublicPath(co.slug),
        },
      ];
    }),
  ];

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <JsonLdScript data={data.jsonLd} />
      <main className="mx-auto w-full max-w-[900px] px-4 pb-16 sm:px-6">
        <div className="py-4" />
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <SeoBreadcrumbs items={crumbs} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{data.cityName}</h1>
            <Link
              href="/map"
              className="inline-flex items-center rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-black/[0.03]"
            >
              Объявления на карте
            </Link>
          </div>
          <p className="text-sm leading-relaxed text-black/55">{intro}</p>
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Популярные категории</h2>
          <div className="flex flex-wrap gap-2">
            {data.popularCategories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-black/[0.03]"
              >
                {cat.title}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Свежие объявления</h2>
          <SeoListingGrid listings={data.listings} />
        </section>

        <div className="mt-8">
          <SeoCompanyList companies={data.companies} heading={`Компании в ${data.cityName}`} />
        </div>

        {mapMarkers.length > 0 && data.mapCenter ?
          <div className="mt-8">
            <SeoMapSectionClient center={mapCenter} markers={mapMarkers} />
          </div>
        : null}
      </main>
    </div>
  );
}
