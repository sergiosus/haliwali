import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogCompanyProfileView } from "../../components/catalog/CatalogCompanyProfile";
import { catalogCompanySeoDescription, catalogCompanySeoTitle } from "../../lib/catalogSeo";
import { breadcrumbListJsonLd, companyBreadcrumbs, localBusinessJsonLd, organizationJsonLd } from "../../lib/seoSchema";
import { companyPublicPath, companyPublicUrl } from "../../lib/seoRoutes";
import {
  ensureCatalogReady,
  getCatalogCompanyBySlug,
  getRelatedCatalogCompanies,
} from "../../lib/serverCatalogStore";
import { JsonLdScript } from "../../components/seo/JsonLdScript";
import { absoluteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company) return { title: "Компания — Haliwali", robots: { index: false, follow: false } };
  const path = companyPublicPath(company.slug);
  const url = absoluteUrl(path);
  const title = catalogCompanySeoTitle(company);
  const description = catalogCompanySeoDescription(company);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "Haliwali",
      ...(company.logoUrl ? { images: [{ url: company.logoUrl }] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function CompanySeoPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company) notFound();

  const related = await getRelatedCatalogCompanies(company.categorySlug, company.slug, 4);
  const canonicalPath = companyPublicPath(company.slug);
  const canonicalUrl = companyPublicUrl(company.slug);
  const jsonLd = [
    organizationJsonLd(),
    localBusinessJsonLd(company, canonicalPath),
    breadcrumbListJsonLd(companyBreadcrumbs(company)),
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <JsonLdScript data={jsonLd} />
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <CatalogCompanyProfileView company={company} related={related} canonicalUrl={canonicalUrl} />
      </div>
    </div>
  );
}
