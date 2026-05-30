import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminPageView } from "../../../../lib/serverAdminSession";
import { AdminCatalogSourceOfferDraftsPanel } from "../AdminCatalogSourceOfferDraftsPanel";

export const dynamic = "force-dynamic";

export default async function AdminCatalogImportDraftsPage(props: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const { panel } = await props.searchParams;
  if (panel !== "source-offers") {
    redirect("/admin/catalogs/import");
  }

  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 py-6">
          <div className="min-w-0">
            <div className="font-semibold tracking-tight">Объявления из источников — кандидаты</div>
            <div className="text-sm text-black/60">Отдельно от импорта компаний</div>
          </div>
          <Link
            href="/admin/catalogs/import"
            className="text-sm font-medium text-black/55 hover:text-black"
          >
            ← Импорт компаний
          </Link>
        </header>
        <main className="pb-16">
          {view === "dashboard" ?
            <AdminCatalogSourceOfferDraftsPanel />
          : <p className="text-sm">Требуется вход администратора.</p>}
        </main>
      </div>
    </div>
  );
}
