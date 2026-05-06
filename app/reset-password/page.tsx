"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { BackNavButton } from "../components/BackNavButton";

function ResetPasswordInner() {
  const sp = useSearchParams();
  const token = (sp.get("token") ?? "").trim();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);

  const disabled = useMemo(() => {
    if (busy) return true;
    if (!token) return true;
    if (newPassword.trim().length < 8) return true;
    if (confirmPassword !== newPassword) return true;
    return false;
  }, [busy, token, newPassword, confirmPassword]);

  return (
    <div className="min-h-full bg-gradient-to-b from-black/[0.05] to-black/[0.02] text-black">
      <div className="mx-auto w-full max-w-7xl px-6">
        <header className="flex items-center py-4">
          <BackNavButton className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="pb-16 pt-6">
          <div className="mx-auto w-[calc(100%-32px)] max-w-[500px]">
            <div className="rounded-2xl border border-gray-200 bg-white px-8 py-7 shadow-sm">
              <div className="mb-2 text-[21px] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-[24px]">
                Сброс пароля
              </div>
              <div className="text-sm text-gray-600">
                {token ? "Введите новый пароль." : "Некорректная ссылка для сброса пароля."}
              </div>

              {done ? (
                <div className="mt-6 grid gap-3">
                  <div className="text-sm text-green-700">Пароль обновлён. Теперь можно войти.</div>
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-semibold text-white hover:brightness-95"
                  >
                    Перейти ко входу
                  </Link>
                </div>
              ) : (
                <form
                  className="mt-6 grid gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (disabled) return;
                    setErr(null);
                    setBusy(true);
                    try {
                      const r = await fetch("/api/auth/reset-password", {
                        method: "POST",
                        credentials: "include",
                        cache: "no-store",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token, newPassword }),
                      });
                      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                      if (!r.ok || !data.ok) {
                        setErr(
                          data.error === "BAD_TOKEN"
                            ? "Ссылка недействительна или устарела."
                            : "Не удалось обновить пароль. Попробуйте позже.",
                        );
                        return;
                      }
                      setDone(true);
                      setNewPassword("");
                      setConfirmPassword("");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Новый пароль</span>
                    <input
                      ref={pwRef}
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                      disabled={busy}
                    />
                    {newPassword.trim().length > 0 && newPassword.trim().length < 8 ? (
                      <span className="text-xs text-red-700">Минимум 8 символов</span>
                    ) : null}
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Повторите пароль</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                      disabled={busy}
                    />
                    {confirmPassword.length > 0 && confirmPassword !== newPassword ? (
                      <span className="text-xs text-red-700">Пароли не совпадают</span>
                    ) : null}
                  </label>

                  {err ? <div className="text-sm text-red-700">{err}</div> : null}

                  <button
                    type="submit"
                    disabled={disabled}
                    className="mt-1 inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                    style={{ backgroundColor: "#ff7a00" }}
                  >
                    {busy ? "Подождите…" : "Обновить пароль"}
                  </button>

                  <div className="text-xs text-black/50">
                    <Link href="/login" className="hover:underline">
                      Вернуться ко входу
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-black/[0.03] text-black" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

