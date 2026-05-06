"use client";

export default function AdminLoginForm({
  action,
  error,
  rate,
  nocfg,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error: boolean;
  rate: boolean;
  nocfg: boolean;
}) {
  return (
    <form action={action} className="mt-6 space-y-4">
      {rate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Слишком много попыток входа. Подождите немного.
        </div>
      ) : null}
      {nocfg ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Задайте переменную окружения <code className="rounded bg-black/5 px-1">ADMIN_PASSWORD</code>.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Неверный пароль.
        </div>
      ) : null}
      <label className="block text-sm font-medium text-black/80">
        Пароль
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none ring-black/10 focus:ring-2"
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-black/20 bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
      >
        Войти
      </button>
    </form>
  );
}
