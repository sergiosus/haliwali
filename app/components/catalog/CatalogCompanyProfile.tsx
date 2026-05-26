"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useState } from "react";
import type { CatalogCompanyListItem, CatalogCompanyProfile } from "../../lib/catalogTypes";
import { CatalogCompanyCard } from "./CatalogCompanyCard";
import {
  catalogCompanyOriginBadgeClass,
  catalogCompanyOriginLabel,
  catalogCompanyOriginView,
} from "../../lib/catalogCompanyOrigin";
import { catalogCategoryVisual } from "../../lib/catalogVisual";
import { formatCoverageText } from "../../lib/catalogCompanyCities";
import { catalogExternalHref, catalogPublicSourceHref } from "../../lib/catalogExternalLinks";
import { catalogYandexMapsHref, hasCatalogCoordinates } from "../../lib/catalogMapLinks";
import { CatalogLegalDisclaimer } from "./CatalogLegalDisclaimer";

const YandexMapPicker = dynamic(
  () => import("../maps/YandexMapPicker").then((m) => m.YandexMapPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-black/[0.04]" /> },
);

export function CatalogCompanyProfileView({
  company,
  related,
}: {
  company: CatalogCompanyProfile;
  related: CatalogCompanyListItem[];
}) {
  const router = useRouter();
  const visual = catalogCategoryVisual(company.categorySlug);
  const phone = company.contacts.find((c) => c.type === "phone")?.value;
  const coverageText = formatCoverageText(company.serviceCities);
  const isVerified = company.profileStatus === "verified";
  const originView = catalogCompanyOriginView(company);
  const sourceHref = catalogPublicSourceHref(company.sourceUrl, company.website);
  const mapHref = catalogYandexMapsHref(company);
  const [claimState, setClaimState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const mapCenter =
    hasCatalogCoordinates(company) ?
      { lat: company.latitude, lng: company.longitude }
    : null;

  function goBackToCategory(e: MouseEvent<HTMLAnchorElement>) {
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  async function requestClaim() {
    setClaimState("sending");
    try {
      const r = await fetch(`/api/catalogs/companies/${encodeURIComponent(company.slug)}/claim`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proofType: "manual",
          message: "Пользователь запросил подтверждение прав на карточку компании.",
        }),
      });
      if (r.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/catalogs/company/${company.slug}`)}`);
        return;
      }
      setClaimState(r.ok ? "sent" : "error");
    } catch {
      setClaimState("error");
    }
  }

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: company.name,
    description: company.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: company.address,
      addressLocality: company.city,
    },
    url: company.website ?? undefined,
    telephone: phone,
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      <Link
        href={`/catalogs/${company.categorySlug}`}
        onClick={goBackToCategory}
        className="inline-flex h-9 w-fit items-center rounded-xl border border-black/[0.08] bg-white px-3 text-sm font-medium text-black/65 shadow-sm hover:bg-black/[0.02] hover:text-black"
      >
        ← Назад к категории
      </Link>

      <nav className="text-sm text-black/45">
        <Link href="/catalogs" className="hover:text-black/70">
          Каталоги компаний
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/catalogs/${company.categorySlug}`} className="hover:text-black/70">
          {company.categoryTitle}
        </Link>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {company.logoUrl || company.images[0] ?
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-zinc-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={company.logoUrl ?? company.images[0]!}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        : (
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl font-bold text-white ${visual.gradient}`}
          >
            {company.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{company.name}</h1>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${catalogCompanyOriginBadgeClass(originView)}`}>
              {catalogCompanyOriginLabel(originView)}
            </span>
          </div>
          <p className="mt-1 text-sm text-black/50">
            {company.city}
          </p>
          <p className="mt-2 inline-flex rounded-md bg-black/[0.04] px-2 py-0.5 text-xs font-medium text-black/55">
            {company.categoryTitle}
          </p>
          {company.rating != null ?
            <p className="mt-2 text-sm font-medium text-black/60">★ {company.rating.toFixed(1)}</p>
          : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {isVerified ?
              <Link
                href="/chat"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:bg-[#f07000]"
              >
                Написать
              </Link>
            : null}
            {company.website ?
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-black/[0.08] px-5 text-sm font-medium text-black/70 hover:bg-black/[0.02]"
              >
                {isVerified ? "Сайт" : "Перейти на сайт"}
              </a>
            : null}
            {mapHref ?
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-black/[0.08] px-5 text-sm font-medium text-black/70 hover:bg-black/[0.02]"
              >
                На карте
              </a>
            : null}
            {!isVerified ?
              <button
                type="button"
                onClick={() => void requestClaim()}
                disabled={claimState === "sending" || claimState === "sent"}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-black/[0.08] px-5 text-sm font-medium text-black/55 hover:bg-black/[0.02] disabled:opacity-50"
              >
                {claimState === "sending" ? "Отправка..." : claimState === "sent" ? "Заявка отправлена" : "Я представитель компании"}
              </button>
            : null}
          </div>
          {!isVerified && claimState === "error" ?
            <p className="mt-2 text-xs text-red-700">Не удалось отправить заявку. Попробуйте позже.</p>
          : null}
        </div>
      </header>

      {!isVerified ? <CatalogLegalDisclaimer /> : null}

      {company.images.length > 1 ?
        <div className="flex gap-2 overflow-x-auto pb-1">
          {company.images.map((src) => (
            <div
              key={src}
              className="h-28 w-40 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-zinc-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      : null}

      {company.description ?
        <section className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-black/70">О компании</h2>
          {coverageText ?
            <p className="mt-2 rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-black/60">
              {coverageText}
            </p>
          : null}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-black/65">
            {company.description}
          </p>
        </section>
      : coverageText ?
        <section className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-black/70">О компании</h2>
          <p className="mt-2 rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-black/60">
            {coverageText}
          </p>
        </section>
      : null}

      {company.contacts.length > 0 || company.address ?
        <section className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-black/70">Контакты</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-black/65">
            {company.address ?
              <li>{company.address}</li>
            : null}
            {company.contacts.map((c, i) => (
              <li key={`${c.type}-${i}`}>
                {c.type === "phone" ?
                  <a href={`tel:${c.value}`} className="font-medium text-[#c25a00] hover:underline">
                    {c.value}
                  </a>
                : c.type === "email" ?
                  <a href={`mailto:${c.value}`} className="font-medium text-[#c25a00] hover:underline">
                    {c.value}
                  </a>
                : c.value}
              </li>
            ))}
          </ul>
        </section>
      : null}

      {mapCenter ?
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-black/70">На карте</h2>
          <div className="h-56 overflow-hidden rounded-2xl border border-black/[0.06] sm:h-72">
            <YandexMapPicker
              center={mapCenter}
              zoom={15}
              listingMarkers={[
                {
                  id: company.slug,
                  lat: mapCenter.lat,
                  lng: mapCenter.lng,
                  previewTitle: company.name,
                  previewType: company.categoryTitle,
                  previewCity: company.city,
                },
              ]}
              className="h-full w-full"
            />
          </div>
        </section>
      : null}

      {related.length > 0 ?
        <section className="space-y-3 pt-2">
          <h2 className="text-lg font-bold text-black">Похожие компании</h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {related.map((co) => (
              <li key={co.slug}>
                <CatalogCompanyCard company={co} />
              </li>
            ))}
          </ul>
        </section>
      : null}
    </div>
  );
}
