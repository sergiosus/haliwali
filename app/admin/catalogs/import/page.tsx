import Link from "next/link";
import { getAdminPageView } from "../../../lib/serverAdminSession";
import AdminCatalogImportClient from "./AdminCatalogImportClient";
import AdminLogoutButton from "../../AdminLogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminCatalogImportPage() {
  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Импорт каталога</div>
            <div className="text-sm text-black/60">Черновики → проверка → публикация</div>
          </div>
          {view === "dashboard" ?
            <div className="flex items-center gap-3">
              <Link
                href="/admin/catalogs/discover"
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Поиск источников
              </Link>
              <Link
                href="/admin/catalogs/import/drafts"
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Черновики
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
            <AdminCatalogImportClient />
          : view === "login_account" ?
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6 text-sm">
              <p>Войдите в аккаунт администратора.</p>
              <Link href="/login" className="mt-4 inline-block font-semibold underline">
                Войти
              </Link>
            </div>
          : view === "forbidden" ?
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6 text-sm">
              <p>Нет прав администратора.</p>
            </div>
          : <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6 text-sm">
              <p>Войдите через /admin</p>
            </div>
          }
        </main>
      </div>
    </div>
  );
}
