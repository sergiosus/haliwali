import { notFound } from "next/navigation";
import { createSeoCityCategoryPage } from "../../../lib/createSeoCategoryPage";
import { RESERVED_ROOT_SEGMENTS, SEO_SEGMENTS, type SeoSegment } from "../../../lib/seoRoutes";

export const dynamic = "force-dynamic";

function parseSegment(raw: string): SeoSegment | null {
  const s = raw.trim().toLowerCase();
  return (SEO_SEGMENTS as readonly string[]).includes(s) ? (s as SeoSegment) : null;
}

export async function generateMetadata(props: {
  params: Promise<{ citySlug: string; segment: string; slug: string }>;
}) {
  const { citySlug, segment, slug } = await props.params;
  if (RESERVED_ROOT_SEGMENTS.has(citySlug.trim().toLowerCase())) {
    return { title: "Haliwali", robots: { index: false, follow: false } };
  }
  const seg = parseSegment(segment);
  if (!seg) return { title: "Haliwali", robots: { index: false, follow: false } };
  return createSeoCityCategoryPage(seg).generateMetadata({ params: Promise.resolve({ citySlug, slug }) });
}

export default async function SeoCityCategoryRoute(props: {
  params: Promise<{ citySlug: string; segment: string; slug: string }>;
}) {
  const { citySlug, segment, slug } = await props.params;
  if (RESERVED_ROOT_SEGMENTS.has(citySlug.trim().toLowerCase())) notFound();
  const seg = parseSegment(segment);
  if (!seg) notFound();
  const Page = createSeoCityCategoryPage(seg).Page;
  return <Page params={Promise.resolve({ citySlug, slug })} />;
}
