import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy entry — opens «Импорт предложений» inside admin catalog panel. */
export default async function AdminCatalogImportDraftsPage(props: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const { panel } = await props.searchParams;
  if (panel === "source-offers") {
    redirect("/admin?section=catalog&catalogTab=offer-import");
  }
  redirect("/admin?section=catalog&catalogTab=import");
}
