import type { Metadata } from "next";
import { CatalogsHomeClient } from "../../components/catalog/CatalogsHomeClient";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  listCatalogCategories,
} from "../../lib/serverCatalogStore";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Компании — Каталог предложений — Haliwali",
  description: "Каталог компаний по отраслям: авто, строительство, ремонт, перевозки и другие.",
  alternates: { canonical: `${siteUrl()}/catalogs/companies` },
  openGraph: {
    title: "Компании — Каталог предложений — Haliwali",
    description: "Найдите компании по категориям и городам России.",
    type: "website",
    url: `${siteUrl()}/catalogs/companies`,
    siteName: "Haliwali",
  },
};

export default async function CatalogCompaniesPage() {
  await ensureCatalogReady();
  let categories = await listCatalogCategories();
  if (categories.length === 0) categories = categoriesFromSeed();
  const initialLoggedIn = Boolean(await getUserIdFromSessionCookie());

  return <CatalogsHomeClient categories={categories} initialLoggedIn={initialLoggedIn} />;
}
