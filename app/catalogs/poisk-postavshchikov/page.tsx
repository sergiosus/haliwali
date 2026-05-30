import type { Metadata } from "next";
import { CatalogSupplierSearchClient } from "../../components/catalog/CatalogSupplierSearchClient";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  listCatalogCategories,
} from "../../lib/serverCatalogStore";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Поиск поставщиков — Каталог предложений — Haliwali",
  description: "Поиск по компаниям, объявлениям из источников, OEM и артикулам.",
  alternates: { canonical: `${siteUrl()}/catalogs/poisk-postavshchikov` },
};

export default async function CatalogSupplierSearchPage() {
  await ensureCatalogReady();
  let categories = await listCatalogCategories();
  if (categories.length === 0) categories = categoriesFromSeed();

  return <CatalogSupplierSearchClient categories={categories} />;
}
