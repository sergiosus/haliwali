import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSourceOffersClient } from "../../components/catalog/CatalogSourceOffersClient";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  listCatalogCategories,
} from "../../lib/serverCatalogStore";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Объявления из источников — Каталог предложений — Haliwali",
  description:
    "Индекс внешних предложений с Avito, Drom, VK и сайтов компаний. Ссылка на оригинальный источник.",
  alternates: { canonical: `${siteUrl()}/catalogs/predlozheniya` },
};

export default async function CatalogSourceOffersPage() {
  await ensureCatalogReady();
  let categories = await listCatalogCategories();
  if (categories.length === 0) categories = categoriesFromSeed();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-3 py-10 text-sm text-black/45">Загрузка каталога…</div>
      }
    >
      <CatalogSourceOffersClient categories={categories} />
    </Suspense>
  );
}
