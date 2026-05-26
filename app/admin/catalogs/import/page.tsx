import Link from "next/link";
import { getAdminPageView } from "../../../lib/serverAdminSession";
import AdminCatalogImportClient from "./AdminCatalogImportClient";

export const dynamic = "force-dynamic";

export default async function AdminCatalogImportPage() {
  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 py-6">
          <div className="min-w-0 leading-tight">
            <div className="font-semibold tracking-tight">Импорт каталога</div>
            <div className="text-sm text-black/60">Кандидаты → проверка → публикация</div>
          </div>
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
