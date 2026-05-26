import Link from "next/link";
import { getAdminPageView } from "../../../lib/serverAdminSession";
import AdminCatalogDiscoverClient from "./AdminCatalogDiscoverClient";

export const dynamic = "force-dynamic";

export default async function AdminCatalogDiscoverPage() {
  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 py-6">
          <div className="min-w-0 leading-tight">
            <div className="font-semibold tracking-tight">Поиск источников</div>
            <div className="text-sm text-black/60">Публичный веб → выбор URL → кандидаты импорта</div>
          </div>
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
