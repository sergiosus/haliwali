"use client";

import Link from "next/link";
import type { CatalogCompanyListItem } from "../../lib/catalogTypes";
import {
  catalogCompanyOriginBadgeClass,
  catalogCompanyOriginLabel,
  catalogCompanyOriginView,
} from "../../lib/catalogCompanyOrigin";
import { catalogYandexMapsHref } from "../../lib/catalogMapLinks";
import { catalogCompanyPath } from "../../lib/catalogSeo";
import { catalogCategoryVisual } from "../../lib/catalogVisual";

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-xs text-black/35">Новая компания</span>;
  }
  return (
    <span className="text-xs font-medium text-black/55">
      ★ {rating.toFixed(1)}
    </span>
  );
}

export function CatalogCompanyCard({ company }: { company: CatalogCompanyListItem }) {
  const visual = catalogCategoryVisual(company.categorySlug);
  const canMessageCompany = company.profileStatus === "verified" && Boolean(company.id && company.claimedByUserId);
  const originView = catalogCompanyOriginView(company);
  const mapHref = catalogYandexMapsHref(company);
  const hasFooterAction = canMessageCompany || Boolean(company.website || company.phone || mapHref);
  const locationLabel = company.locationContext ?? company.city;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href={catalogCompanyPath(company)}
        className="flex min-w-0 flex-1 gap-3 p-4"
      >
        {company.logoUrl ?
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-zinc-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
          </div>
        : (
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white ${visual.gradient}`}
          >
            {company.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-black group-hover:text-[#c25a00]">
            {company.name}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-black/50">{locationLabel || "Россия"}</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-black/45 sm:line-clamp-2">
            {company.description || company.categoryTitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/55">
              {company.categoryTitle}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${catalogCompanyOriginBadgeClass(originView)}`}>
              {catalogCompanyOriginLabel(originView)}
            </span>
            <Stars rating={company.rating} />
          </div>
        </div>
      </Link>
      {hasFooterAction ?
        <div className="mt-auto flex gap-2 border-t border-black/[0.04] px-3 py-2.5">
          {canMessageCompany ?
            <Link
              href={`/messages/company/${encodeURIComponent(String(company.id))}`}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-sm font-medium text-black/75 transition-colors hover:border-orange-200 hover:bg-orange-50"
            >
              Написать
            </Link>
          : company.website ?
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-sm font-medium text-black/75 transition-colors hover:border-orange-200 hover:bg-orange-50"
            >
              Перейти на сайт
            </a>
          : company.phone ?
            <a
              href={`tel:${company.phone.replace(/\s/g, "")}`}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-sm font-medium text-black/75 transition-colors hover:border-orange-200 hover:bg-orange-50"
            >
              Позвонить
            </a>
          : null}
          {mapHref ?
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.02] text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
            >
              На карте
            </a>
          : null}
        </div>
      : null}
    </article>
  );
}
