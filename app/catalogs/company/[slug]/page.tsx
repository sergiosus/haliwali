import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogCompanyProfileView } from "../../../components/catalog/CatalogCompanyProfile";
import {
  ensureCatalogReady,
  getCatalogCompanyBySlug,
  getRelatedCatalogCompanies,
} from "../../../lib/serverCatalogStore";
import { siteUrl } from "../../../lib/siteUrl";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company) return { title: "Компания — Haliwali" };
  const url = `${siteUrl()}/catalogs/company/${encodeURIComponent(slug)}`;
  const title = `${company.name} — ${company.city} | Haliwali`;
  const description =
    company.description.slice(0, 160) || `${company.name}, ${company.categoryTitle}, ${company.city}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url, siteName: "Haliwali" },
  };
}

export default async function CatalogCompanyPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  await ensureCatalogReady();
  const company = await getCatalogCompanyBySlug(slug);
  if (!company) notFound();

  const related = await getRelatedCatalogCompanies(company.categorySlug, company.slug, 4);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <CatalogCompanyProfileView company={company} related={related} />
      </div>
    </div>
  );
}
