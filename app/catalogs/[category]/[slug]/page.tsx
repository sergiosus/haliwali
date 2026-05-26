import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogCompanyProfileView } from "../../../components/catalog/CatalogCompanyProfile";
import {
  ensureCatalogReady,
  getCatalogCompanyBySlug,
  getRelatedCatalogCompanies,
} from "../../../lib/serverCatalogStore";
import {
  catalogCompanySeoDescription,
  catalogCompanySeoTitle,
  catalogCompanyUrl,
} from "../../../lib/catalogSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { category, slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company || company.categorySlug !== category) {
    return { title: "Компания — Haliwali", robots: { index: false, follow: false } };
  }
  const url = catalogCompanyUrl(company);
  const title = catalogCompanySeoTitle(company);
  const description = catalogCompanySeoDescription(company);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url, siteName: "Haliwali" },
  };
}

export default async function CatalogCategoryCompanyPage(props: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company || company.categorySlug !== category) notFound();

  const related = await getRelatedCatalogCompanies(company.categorySlug, company.slug, 4);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <CatalogCompanyProfileView company={company} related={related} canonicalUrl={catalogCompanyUrl(company)} />
      </div>
    </div>
  );
}
