import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy discover route → unified company import page. */
export default function AdminCatalogDiscoverPage() {
  redirect("/admin/catalogs/import");
}
