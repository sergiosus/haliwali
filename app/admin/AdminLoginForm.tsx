"use client";

import { useState } from "react";

export default function AdminLoginForm({
  error,
  rate,
  nocfg,
}: {
  error: boolean;
  rate: boolean;
  nocfg: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(error);
  const [localRate, setLocalRate] = useState(rate);
  const [localNocfg, setLocalNocfg] = useState(nocfg);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setLocalError(false);
        setLocalRate(false);
        setLocalNocfg(false);

        const fd = new FormData(e.currentTarget);
        void (async () => {
          try {
            const res = await fetch("/api/admin/login", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              body: fd,
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              redirect?: string;
              code?: string;
            };
            if (data.ok && data.redirect) {
              window.location.href = data.redirect;
              return;
            }
            if (data.code === "rate") {
              setLocalRate(true);
              return;
            }
            if (data.code === "nocfg") {
              setLocalNocfg(true);
              return;
            }
            if (data.code === "error") {
              setLocalError(true);
              return;
            }
            setLocalError(true);
          } catch {
            setLocalError(true);
          } finally {
            setSubmitting(false);
          }
        })();
      }}
    >
      {localRate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Слишком много попыток входа. Подождите немного.
        </div>
      ) : null}
      {localNocfg ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Задайте переменную окружения <code className="rounded bg-black/5 px-1">ADMIN_PASSWORD</code>.
        </div>
      ) : null}
      {localError ? (
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
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-black/20 bg-black px-4 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-60"
      >
        {submitting ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
