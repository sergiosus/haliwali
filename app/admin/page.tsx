import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";
import AdminLoginForm from "./AdminLoginForm";
import {
  adminRateLimitOk,
  clearAdminCookie,
  createAdminSession,
  destroyCurrentAdminSessionsFromCookies,
  getAdminPageView,
  setAdminCookie,
} from "../lib/serverAdminSession";
import { invalidateCurrentUserSessionCookie } from "../lib/serverSession";
import { getAdminPassword } from "@/app/lib/admin-password";
import { isDebugAuthServer } from "@/app/lib/debugAuth";

async function login(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") {
    redirect("/admin");
  }

  const okRate = await adminRateLimitOk();
  if (!okRate) {
    redirect("/admin?rate=1");
  }

  const jar = await cookies();

  const password = String(formData.get("password") ?? "");

  if (!getAdminPassword()) {
    if (isDebugAuthServer()) {
      console.log("[admin-auth] login", { success: false, reason: "no_password_config" });
    }
    redirect("/admin?nocfg=1");
  }

  const okPwd = password === getAdminPassword();
  if (!okPwd) {
    if (isDebugAuthServer()) {
      console.log("[admin-auth] login", { success: false, reason: "bad_password" });
    }
    redirect("/admin?error=1");
  }

  const { token, maxAgeSec } = await createAdminSession();
  await setAdminCookie(jar, token, maxAgeSec);

  if (isDebugAuthServer()) {
    console.log("[admin-auth] login", { success: true });
  }

  redirect("/admin");
}

async function logout() {
  "use server";
  await invalidateCurrentUserSessionCookie();
  const jar = await cookies();
  await destroyCurrentAdminSessionsFromCookies();
  await clearAdminCookie(jar);
  redirect("/admin");
}

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
          {view === "dashboard" ? (
            <form action={logout}>
              <button
                type="submit"
                className="h-10 rounded-full border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
              >
                Выйти
              </button>
            </form>
          ) : null}
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

              <AdminLoginForm action={login} error={error} rate={rate} nocfg={nocfg} />
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
