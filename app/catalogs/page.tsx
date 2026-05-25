import { CatalogsHomeClient } from "../components/catalog/CatalogsHomeClient";
import {
  categoriesFromSeed,
  ensureCatalogReady,
  listCatalogCategories,
} from "../lib/serverCatalogStore";
import { getUserIdFromSessionCookie } from "../lib/serverSession";

export const dynamic = "force-dynamic";

export default async function CatalogsHomePage() {
  await ensureCatalogReady();
  let categories = await listCatalogCategories();
  if (categories.length === 0) categories = categoriesFromSeed();
  const initialLoggedIn = Boolean(await getUserIdFromSessionCookie());

  return <CatalogsHomeClient categories={categories} initialLoggedIn={initialLoggedIn} />;
}
