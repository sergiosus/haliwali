import type { Metadata } from "next";
import { Suspense } from "react";
import { searchPageHasFilters } from "../lib/seoIndexability";
import { siteUrl } from "../lib/siteUrl";
import { SearchPageClient } from "./SearchPageClient";

const SEARCH_TITLE = "Поиск — Haliwali";
const SEARCH_DESCRIPTION = "Поиск задач, услуг, товаров и предложений на Haliwali.";
const CANONICAL = `${siteUrl()}/search`;

export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const filtered = searchPageHasFilters(searchParams);

  return {
    title: SEARCH_TITLE,
    description: SEARCH_DESCRIPTION,
    alternates: { canonical: CANONICAL },
    ...(filtered ?
      { robots: { index: false, follow: true } }
    : { robots: { index: true, follow: true } }),
  };
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 text-sm text-black/60">Загрузка…</main>}>
      <SearchPageClient />
    </Suspense>
  );
}
