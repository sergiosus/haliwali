import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSourceOffersClient } from "../../components/catalog/CatalogSourceOffersClient";
import { ensureCatalogReady } from "../../lib/serverCatalogStore";
import { sourceOffersListHasFilters } from "../../lib/seoIndexability";
import { siteUrl } from "../../lib/siteUrl";

export const dynamic = "force-dynamic";

const LIST_TITLE = "Объявления из источников — Каталог предложений — Haliwali";
const LIST_DESCRIPTION =
  "Поиск предложений с внешних площадок по названию, бренду и артикулу. Ссылка на оригинальный источник.";
const CANONICAL = `${siteUrl()}/catalogs/predlozheniya`;

export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const filtered = sourceOffersListHasFilters(searchParams);

  return {
    title: LIST_TITLE,
    description: LIST_DESCRIPTION,
    alternates: { canonical: CANONICAL },
    ...(filtered ?
      { robots: { index: false, follow: true } }
    : { robots: { index: true, follow: true } }),
  };
}

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
