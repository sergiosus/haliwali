import Link from "next/link";
import { getAdminPageView } from "../../../../lib/serverAdminSession";
import { AdminCatalogDraftsPanel } from "../AdminCatalogDraftsPanel";
import AdminLogoutButton from "../../../AdminLogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminCatalogImportDraftsPage() {
  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div>
            <div className="font-semibold tracking-tight">Черновики каталога</div>
            <div className="text-sm text-black/60">Проверка, правка, публикация</div>
          </div>
          {view === "dashboard" ?
            <div className="flex gap-3">
              <Link href="/admin/catalogs/import" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium">
                Импорт
              </Link>
              <AdminLogoutButton />
            </div>
          : null}
        </header>
        <main className="pb-16">
          {view === "dashboard" ?
            <AdminCatalogDraftsPanel />
          : (
            <p className="text-sm">Требуется вход администратора.</p>
          )}
        </main>
      </div>
    </div>
  );
}
