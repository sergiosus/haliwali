import type { Metadata } from "next";
import { truncateMetaDescription, listingPath } from "../../lib/seo";
import { getListingById, isPublicModerationStatus, listingForPublicViewer } from "../../lib/serverListingsStore";
import { isListingPubliclyListed } from "../../lib/listingModel";
import { siteUrl } from "../../lib/siteUrl";

function safeListingDescription(raw: string): string {
  return truncateMetaDescription(String(raw ?? "").replace(/\s+/g, " ").trim(), 120, 160);
}

function safeOgImageUrl(base: string, photo: string | undefined): string | null {
  const p = String(photo ?? "").trim();
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/")) return `${base}${p}`;
  return null;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const base = siteUrl();
  const listing = await getListingById(id);
  if (!listing || !isListingPubliclyListed(listing) || !isPublicModerationStatus(listing.status)) {
    const url = `${base}/listing/${encodeURIComponent(id)}`;
    return {
      title: "Объявление не найдено | Haliwali",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  const pub = listingForPublicViewer(listing);
  const title = `${(pub.title ?? "").trim()} | Haliwali`;
  const description = safeListingDescription(pub.description ?? "");
  const canonical = `${base}${listingPath(pub.id, pub.title)}`;
  const img = safeOgImageUrl(base, Array.isArray(pub.photos) ? pub.photos[0] : undefined);

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
      ...(img ? { images: [img] } : {}),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title,
      description,
      ...(img ? { images: [img] } : {}),
    },
  };
}

export default async function ListingLayout(props: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const base = siteUrl();
  const listing = await getListingById(id);

  // JSON-LD only for public listings; never include phone/email.
  if (!listing || !isListingPubliclyListed(listing) || !isPublicModerationStatus(listing.status)) {
    return props.children;
  }
  const pub = listingForPublicViewer(listing);
  const canonical = `${base}${listingPath(pub.id, pub.title)}`;
  const img = safeOgImageUrl(base, Array.isArray(pub.photos) ? pub.photos[0] : undefined);

  const city = (pub.city ?? "").trim();
  const region = (pub.location?.region ?? "").trim();
  const locationText = [city, region].filter(Boolean).join(", ");

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type":
      pub.type === "product_sell" || pub.type === "product_buy" ? "Product" : "ClassifiedAd",
    name: (pub.title ?? "").trim(),
    description: safeListingDescription(pub.description ?? ""),
    category: (pub.categoryName ?? "").trim(),
    url: canonical,
    ...(img ? { image: [img] } : {}),
    ...(locationText ? { areaServed: locationText } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {props.children}
    </>
  );
}

