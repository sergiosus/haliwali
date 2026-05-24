import Link from "next/link";
import { getAdminPageView } from "../../../lib/serverAdminSession";
import AdminCatalogDiscoverClient from "./AdminCatalogDiscoverClient";
import AdminLogoutButton from "../../AdminLogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminCatalogDiscoverPage() {
  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Поиск источников</div>
            <div className="text-sm text-black/60">Публичный веб → выбор URL → черновики импорта</div>
          </div>
          {view === "dashboard" ?
            <div className="flex items-center gap-3">
              <Link
                href="/admin/catalogs/import"
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Импорт
              </Link>
              <Link
                href="/admin"
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Админка
              </Link>
              <AdminLogoutButton />
            </div>
          : null}
        </header>

        <main className="pb-16">
          {view === "dashboard" ?
            <AdminCatalogDiscoverClient />
          : (
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6 text-sm">
              <p>Требуется вход администратора.</p>
              <Link href="/admin" className="mt-4 inline-block font-semibold underline">
                Войти
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
