import Link from "next/link";
import AdminClient from "./AdminClient";
import AdminLoginForm from "./AdminLoginForm";
import AdminLogoutButton from "./AdminLogoutButton";
import { getAdminPageView } from "../lib/serverAdminSession";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const error = Boolean(sp.error);
  const rate = Boolean(sp.rate);
  const nocfg = Boolean(sp.nocfg);

  const view = await getAdminPageView();

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Админка Haliwali</div>
            <div className="text-sm text-black/60">Модерация задач, услуг и товаров</div>
          </div>
          {view === "dashboard" ? <AdminLogoutButton /> : null}
        </header>

        <main className="pb-16">
          {view === "dashboard" ? (
            <AdminClient />
          ) : view === "login_account" ? (
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6">
              <div className="text-lg font-semibold tracking-tight">Требуется вход</div>
              <p className="mt-2 text-sm text-black/70">
                Войдите в аккаунт администратора с помощью обычной формы входа на сайте.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-black/20 bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
              >
                Войти
              </Link>
            </div>
          ) : view === "forbidden" ? (
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6">
              <div className="text-lg font-semibold tracking-tight">Нет прав администратора</div>
              <p className="mt-2 text-sm text-black/70">
                У этой учётной записи нет доступа к панели. Обратитесь к владельцу сервиса, если вам нужны права.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
              >
                На главную
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white p-6">
              <div className="text-lg font-semibold tracking-tight">Вход</div>
              <div className="mt-2 text-sm text-black/60">
                Введите пароль администратора (только для локальной разработки).
              </div>

              <AdminLoginForm error={error} rate={rate} nocfg={nocfg} />
              {process.env.NODE_ENV !== "production" ? (
                <div className="mt-4 text-xs text-black/50">
                  Первый вход: задайте <code className="rounded bg-black/5 px-1">ADMIN_PASSWORD</code> в окружении. После смены пароля в панели он сохраняется в{" "}
                  <code>.data/admin-login-override.txt</code> (переменная окружения не меняется).
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
