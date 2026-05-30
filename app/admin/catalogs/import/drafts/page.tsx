import Link from "next/link";
import { getAdminPageView } from "../../../../lib/serverAdminSession";
import { AdminCatalogDraftsPanel } from "../AdminCatalogDraftsPanel";
import { AdminCatalogSourceOfferDraftsPanel } from "../AdminCatalogSourceOfferDraftsPanel";

export const dynamic = "force-dynamic";

export default async function AdminCatalogImportDraftsPage(props: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const view = await getAdminPageView();
  const { panel } = await props.searchParams;
  const sourceOffers = panel === "source-offers";

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 py-6">
          <div className="min-w-0">
            <div className="font-semibold tracking-tight">Кандидаты каталога</div>
            <div className="text-sm text-black/60">Проверка, правка, публикация</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/catalogs/import/drafts"
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                !sourceOffers ? "border-black/20 bg-black/[0.06]" : "border-black/10 text-black/55",
              ].join(" ")}
            >
              Компании
            </Link>
            <Link
              href="/admin/catalogs/import/drafts?panel=source-offers"
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                sourceOffers ? "border-black/20 bg-black/[0.06]" : "border-black/10 text-black/55",
              ].join(" ")}
            >
              Объявления из источников
            </Link>
          </div>
        </header>
        <main className="pb-16">
          {view === "dashboard" ?
            sourceOffers ?
              <AdminCatalogSourceOfferDraftsPanel />
            : <AdminCatalogDraftsPanel />
          : <p className="text-sm">Требуется вход администратора.</p>}
        </main>
      </div>
    </div>
  );
}
