import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogSourceNameLabel } from "../../../lib/catalogSourceName";
import { displaySourceOfferPrice } from "../../../lib/catalogOfferPrice";
import { resolveCoverImageUrl } from "../../../lib/catalogSourceOfferCoverImage";
import {
  sourceOfferDisplayCityLabel,
  sourceOfferMetaDescription,
  sourceOfferPageTitle,
  sourceOfferPublicPath,
} from "../../../lib/catalogSourceOfferSeo";
import { breadcrumbListJsonLd, sourceOfferBreadcrumbs, sourceOfferJsonLd } from "../../../lib/seoSchema";
import { getPublishedSourceOfferById } from "../../../lib/serverCatalogSourceOfferStore";
import { siteUrl } from "../../../lib/siteUrl";
import { ensureCatalogReady } from "../../../lib/serverCatalogStore";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function parseOfferId(raw: string): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { id: rawId } = await props.params;
  const id = parseOfferId(rawId);
  const base = siteUrl();
  if (!id) {
    return {
      title: "Предложение не найдено | Haliwali",
      robots: { index: false, follow: false },
    };
  }

  const offer = await getPublishedSourceOfferById(id);
  if (!offer) {
    return {
      title: "Предложение не найдено | Haliwali",
      alternates: { canonical: `${base}${sourceOfferPublicPath(id)}` },
      robots: { index: false, follow: false },
    };
  }

  const city = sourceOfferDisplayCityLabel(offer);
  const title = sourceOfferPageTitle(offer.title, city);
  const description = sourceOfferMetaDescription(offer);
  const canonical = `${base}${sourceOfferPublicPath(id)}`;
  const image = resolveCoverImageUrl({
    coverImageUrl: offer.coverImageUrl,
    imageUrl: offer.imageUrl,
    rawPayload: offer.rawPayload,
  });

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: "Haliwali",
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function CatalogSourceOfferDetailPage(props: PageProps) {
  await ensureCatalogReady();
  const { id: rawId } = await props.params;
  const id = parseOfferId(rawId);
  if (!id) notFound();

  const offer = await getPublishedSourceOfferById(id);
  if (!offer) notFound();

  const city = sourceOfferDisplayCityLabel(offer);
  const cover = resolveCoverImageUrl({
    coverImageUrl: offer.coverImageUrl,
    imageUrl: offer.imageUrl,
    rawPayload: offer.rawPayload,
  });
  const snippet = (offer.shortSnippet ?? "").trim();
  const crumbs = sourceOfferBreadcrumbs(offer);
  const jsonLd = [breadcrumbListJsonLd(crumbs), sourceOfferJsonLd(offer)];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
        <nav className="mb-4 text-sm text-black/50" aria-label="Хлебные крошки">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <li key={c.path} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {i < crumbs.length - 1 ?
                  <Link href={c.path} className="hover:text-black/70">
                    {c.name}
                  </Link>
                : <span className="text-black/70">{c.name}</span>}
              </li>
            ))}
          </ol>
        </nav>

        <article className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm">
          {cover ?
            <div className="relative aspect-[16/10] max-h-[320px] w-full overflow-hidden bg-black/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt={offer.title}
                className="h-full w-full object-cover"
                width={640}
                height={400}
                loading="eager"
                decoding="async"
              />
              <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-violet-900 shadow-sm">
                {catalogSourceNameLabel(offer.sourceName)}
              </span>
            </div>
          : null}

          <div className="p-4 sm:p-6">
            <h1 className="text-xl font-extrabold tracking-tight text-black sm:text-2xl">{offer.title}</h1>
            <p className="mt-3 text-2xl font-bold tracking-tight text-black">{displaySourceOfferPrice(offer)}</p>
            {city ?
              <p className="mt-2 text-sm font-medium text-black/60">{city}</p>
            : null}
            {snippet ?
              <p className="mt-4 text-sm leading-relaxed text-black/60">{snippet}</p>
            : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={offer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#ff7a00] px-6 text-sm font-semibold text-white hover:bg-[#f07000]"
              >
                Открыть на {catalogSourceNameLabel(offer.sourceName)}
              </a>
              <Link
                href="/catalogs/predlozheniya"
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-medium text-black/70 hover:bg-black/[0.03]"
              >
                Все предложения
              </Link>
            </div>
          </div>
        </article>

      </div>
    </div>
  );
}
