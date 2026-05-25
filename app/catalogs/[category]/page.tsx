import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogCategoryClient } from "../../components/catalog/CatalogCategoryClient";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  getCatalogCategory,
  listCatalogCategories,
  searchCatalogCompanies,
} from "../../lib/serverCatalogStore";
import { siteUrl } from "../../lib/siteUrl";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await props.params;
  await ensureCatalogReady();
  const cat = await getCatalogCategory(slug);
  if (!cat) return { title: "Каталог — Haliwali" };
  const url = `${siteUrl()}/catalogs/${encodeURIComponent(slug)}`;
  const title = `${cat.title} — каталог компаний | Haliwali`;
  const description = `${cat.subtitle}. Компании в категории «${cat.title}» на Haliwali.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url, siteName: "Haliwali" },
  };
}

export default async function CatalogCategoryPage(props: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await props.params;
  await ensureCatalogReady();
  const category = await getCatalogCategory(slug);
  if (!category) notFound();

  const [companies, listedCategories, userId] = await Promise.all([
    searchCatalogCompanies({ categorySlug: slug }),
    listCatalogCategories(),
    getUserIdFromSessionCookie(),
  ]);
  const categories = listedCategories.length > 0 ? listedCategories : categoriesFromSeed();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <CatalogCategoryClient
          category={category}
          categories={categories}
          initialCompanies={companies}
          initialLoggedIn={Boolean(userId)}
        />
      </div>
    </div>
  );
}
