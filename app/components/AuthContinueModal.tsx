"use client";

import { useMemo, useState } from "react";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { setSession } from "../lib/auth";
import { getOrCreateOwnerId } from "../lib/listingsStore";
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from "../lib/identity";

type Mode = "choice" | "email" | "phone";

export function AuthContinueModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<Mode>("choice");
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Non-error status (e.g. registration code sent). */
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [modalDevRegCode, setModalDevRegCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const label = useMemo(() => {
    if (mode === "email") return "Email";
    if (mode === "phone") return "Телефон";
    return "";
  }, [mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-5 shadow-xl sm:p-6">
        <div className="text-lg font-semibold tracking-tight">Войти или зарегистрироваться</div>

        {mode === "choice" ? (
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("email");
                setValue("");
                setConsent(false);
                setError(null);
                setFormInfo(null);
                setModalDevRegCode(null);
              }}
              className="inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
              style={{ backgroundColor: "#ff7a00" }}
            >
              Продолжить по email
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("phone");
                setValue("");
                setConsent(false);
                setError(null);
                setFormInfo(null);
                setModalDevRegCode(null);
              }}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
            >
              Продолжить по телефону
            </button>
          </div>
        ) : (
          <form
            className="mt-4 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (loading) return;
              const v = value.trim();
              if (!v) {
                setError(`Укажите ${label.toLowerCase()}`);
                return;
              }
              if (!password.trim()) {
                setError("Введите пароль");
                return;
              }
              if (!consent) {
                setError("Необходимо дать согласие на обработку персональных данных");
                return;
              }
              const viaEmail = mode === "email";
              if (!viaEmail) {
                if (!normalizePhone(v) || !isValidPhone(v)) {
                  setError(PHONE_VALIDATION_MESSAGE);
                  return;
                }
              }
              setError(null);
              setFormInfo(null);
              setModalDevRegCode(null);
              setLoading(true);
              try {
                // Server-side auth: never store passwords locally.
                const loginResp = await fetch("/api/auth/login", {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ value: v, password }),
                });
                const loginData = (await loginResp.json().catch(() => ({}))) as { error?: string; user?: { userId: string } };
                if (loginResp.ok) {
                  setSession(loginData.user?.userId ?? "", v);
                  getOrCreateOwnerId();
                  onSuccess();
                  return;
                }
                if (loginData.error !== "NOT_FOUND") {
                  setError("Неверный email или пароль.");
                  return;
                }

                // Register (email only here to keep UX minimal without OTP UI).
                if (!viaEmail) {
                  setError("Для регистрации по телефону используйте страницу входа.");
                  return;
                }
                const req = await fetch("/api/auth/request-registration-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ confirmMethod: "email", email: v, password }),
                });
                const reqData = (await req.json().catch(() => ({}))) as { error?: string; devCode?: string };
                if (!req.ok) {
                  setError(reqData.error ?? "Не удалось отправить код");
                  return;
                }
                const dc = typeof reqData.devCode === "string" && /^\d{6}$/.test(reqData.devCode) ? reqData.devCode : null;
                setFormInfo("Код отправлен. Завершите регистрацию на странице входа.");
                setModalDevRegCode(process.env.NODE_ENV === "development" ? dc : null);
              } finally {
                setLoading(false);
              }
            }}
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium text-black/80">{label}</span>
              <input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                  setFormInfo(null);
                  setModalDevRegCode(null);
                }}
                className={[
                  "h-10 w-full rounded-lg border bg-white px-4 text-sm outline-none",
                  "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
                  error ? "border-red-300" : "border-black/15",
                ].join(" ")}
                placeholder={label}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-black/80">Пароль</span>
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                    setFormInfo(null);
                    setModalDevRegCode(null);
                  }}
                  type={pwVisible ? "text" : "password"}
                  className={[
                    "h-10 w-full rounded-lg border bg-white px-4 pr-11 text-sm outline-none",
                    "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
                    error ? "border-red-300" : "border-black/15",
                  ].join(" ")}
                  placeholder="Пароль"
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={pwVisible ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setPwVisible((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                >
                  {pwVisible ? "🙈" : "👁"}
                </button>
              </div>
            </label>

            <ConsentCheckbox checked={consent} onChange={setConsent} error={null} />

            {formInfo ? <div className="text-sm text-green-700">{formInfo}</div> : null}
            {process.env.NODE_ENV === "development" && modalDevRegCode ? (
              <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                Код для разработки: {modalDevRegCode}
              </div>
            ) : null}
            {error ? <div className="text-sm text-red-700">{error}</div> : null}

            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setMode("choice");
                  setValue("");
                  setConsent(false);
                  setError(null);
                  setFormInfo(null);
                  setModalDevRegCode(null);
                }}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
              >
                Назад
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
                style={{ backgroundColor: "#ff7a00" }}
                disabled={loading}
              >
                {loading ? "Подождите…" : "Продолжить"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setMode("choice");
              setValue("");
              setConsent(false);
              setError(null);
              setFormInfo(null);
              setModalDevRegCode(null);
              onClose();
            }}
            className="text-sm font-semibold text-black/60 hover:text-black hover:underline"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

