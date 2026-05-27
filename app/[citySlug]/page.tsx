import type { Metadata } from "next";
import { SeoCityPageView } from "../components/seo/SeoCityPageView";
import { loadSeoCityPageData, metadataForSeoCityPage } from "../lib/seoCityPageData";
import { RESERVED_ROOT_SEGMENTS } from "../lib/seoRoutes";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ citySlug: string }>;
}): Promise<Metadata> {
  const { citySlug } = await props.params;
  if (RESERVED_ROOT_SEGMENTS.has(citySlug.trim().toLowerCase())) {
    return { title: "Haliwali", robots: { index: false, follow: false } };
  }
  const data = await loadSeoCityPageData(citySlug);
  return metadataForSeoCityPage(data);
}

export default async function SeoCityLandingPage(props: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await props.params;
  const slug = citySlug.trim().toLowerCase();
  if (RESERVED_ROOT_SEGMENTS.has(slug)) notFound();
  const data = await loadSeoCityPageData(citySlug);
  return <SeoCityPageView data={data} />;
}
