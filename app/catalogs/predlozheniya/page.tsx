import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSourceOffersClient } from "../../components/catalog/CatalogSourceOffersClient";
import { ensureCatalogReady } from "../../lib/serverCatalogStore";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Объявления из источников — Каталог предложений — Haliwali",
  description:
    "Поиск предложений с внешних площадок по названию, бренду и артикулу. Ссылка на оригинальный источник.",
  alternates: { canonical: `${siteUrl()}/catalogs/predlozheniya` },
};

export default async function CatalogSourceOffersPage() {
  await ensureCatalogReady();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-3 py-10 text-sm text-black/45">Загрузка каталога…</div>
      }
    >
      <CatalogSourceOffersClient />
    </Suspense>
  );
}
