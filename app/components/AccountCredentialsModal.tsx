"use client";

import { useEffect, useState, type FormEvent } from "react";
import { setSession } from "../lib/auth";
import { rememberCurrentSession } from "../lib/rememberedAccounts";
import { getOrCreateOwnerId } from "../lib/listingsStore";
import { pingPresenceThrottled } from "../lib/clientPresencePing";

export type AccountCredentialsModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string | null;
  initialLogin: string;
  onLoggedIn: () => void;
};

export function AccountCredentialsModal({
  open,
  onClose,
  title,
  subtitle,
  initialLogin,
  onLoggedIn,
}: AccountCredentialsModalProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoginId("");
      setPassword("");
      setError(null);
      setLoading(false);
      return;
    }
    queueMicrotask(() => setLoginId(initialLogin.trim()));
  }, [open, initialLogin]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const id = loginId.trim();
    if (!id) {
      setError("Укажите email или телефон");
      return;
    }
    if (!password.trim()) {
      setError("Введите пароль");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: id, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; user?: { userId: string } };
      if (!response.ok) {
        if (data.error === "NOT_FOUND") setError("Аккаунт не найден. Зарегистрируйтесь.");
        else setError("Неверный email/телефон или пароль.");
        return;
      }
      const uid = (data.user?.userId ?? "").trim();
      setSession(uid, id);
      if (uid) rememberCurrentSession(uid, id);
      getOrCreateOwnerId();
      void pingPresenceThrottled({ force: true });
      onLoggedIn();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-credentials-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-xl leading-none text-gray-600 hover:bg-gray-50"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="border-b border-gray-100 px-6 py-4 pr-14">
          <h2 id="account-credentials-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>

        <form
          className="px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(e);
          }}
          autoComplete="off"
        >
          <label className="grid gap-2">
            <span className="text-sm font-medium text-black/80">Email или телефон</span>
            <input
              name="account_cred_login_temp"
              value={loginId}
              onChange={(ev) => {
                setLoginId(ev.target.value);
                if (error) setError(null);
              }}
              className="h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]"
              placeholder="Email или телефон"
              autoComplete="off"
            />
          </label>
          <label className="mt-4 grid gap-2">
            <span className="text-sm font-medium text-black/80">Пароль</span>
            <input
              name="account_cred_password_temp"
              type="password"
              value={password}
              onChange={(ev) => {
                setPassword(ev.target.value);
                if (error) setError(null);
              }}
              className="h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]"
              placeholder="Пароль"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
