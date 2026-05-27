import type { Metadata } from "next";
import { SeoCategoryPageView } from "../components/seo/SeoCategoryPageView";
import {
  loadSeoCategoryPageData,
  metadataForSeoCategoryPage,
} from "./seoCategoryPageData";
import type { SeoSegment } from "./seoRoutes";

export function createSeoCategorySegmentPage(segment: SeoSegment) {
  async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await props.params;
    const data = await loadSeoCategoryPageData(segment, slug);
    return metadataForSeoCategoryPage(data);
  }

  async function Page(props: { params: Promise<{ slug: string }> }) {
    const { slug } = await props.params;
    const data = await loadSeoCategoryPageData(segment, slug);
    return <SeoCategoryPageView data={data} />;
  }

  return { generateMetadata, Page };
}

export function createSeoCityCategoryPage(segment: SeoSegment) {
  async function generateMetadata(props: {
    params: Promise<{ citySlug: string; slug: string }>;
  }): Promise<Metadata> {
    const { citySlug, slug } = await props.params;
    const data = await loadSeoCategoryPageData(segment, slug, citySlug);
    return metadataForSeoCategoryPage(data);
  }

  async function Page(props: { params: Promise<{ citySlug: string; slug: string }> }) {
    const { citySlug, slug } = await props.params;
    const data = await loadSeoCategoryPageData(segment, slug, citySlug);
    return <SeoCategoryPageView data={data} />;
  }

  return { generateMetadata, Page };
}
