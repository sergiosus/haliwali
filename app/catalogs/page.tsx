import Link from "next/link";
import { CatalogCategoryGrid } from "../components/catalog/CatalogCategoryGrid";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  listCatalogCategories,
} from "../lib/serverCatalogStore";

export const dynamic = "force-dynamic";

export default async function CatalogsHomePage() {
  await ensureCatalogReady();
  let categories = await listCatalogCategories();
  if (categories.length === 0) categories = categoriesFromSeed();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#fff8f3] via-white to-white">
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">Каталоги</h1>
          <p className="mt-2 text-sm text-black/55 sm:text-base">
            Компании по отраслям — отдельно от объявлений Haliwali
          </p>
        </header>

        <div className="mt-8">
          <CatalogCategoryGrid categories={categories} />
        </div>

        <p className="mt-8 text-center text-sm text-black/45">
          <Link href="/" className="font-medium text-[#c25a00] hover:underline">
            ← К объявлениям
          </Link>
        </p>
      </div>
    </div>
  );
}
