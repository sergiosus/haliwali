"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BackNavButton } from "../components/BackNavButton";
import { getOrCreateOwnerId } from "../lib/listingsStore";
import { setSession, useAuth } from "../lib/auth";
import { rememberCurrentSession } from "../lib/rememberedAccounts";
import { pingPresenceThrottled } from "../lib/clientPresencePing";
import { normalizeEmail, normalizePhone, isValidPhone, PHONE_VALIDATION_MESSAGE } from "../lib/identity";
import {
  SMS_LOGIN_CODE_PHONE_HINT,
} from "../lib/smsLoginMessages";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-black/[0.03] text-black" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") || "/account";
  const redirectTo = nextParam.startsWith("/") ? nextParam : "/account";
  const initialTab = searchParams.get("tab") === "register" ? "register" : "login";
  const [tab, setTab] = useState<"login" | "register">(initialTab);
  const [loginSubMode, setLoginSubMode] = useState<"password" | "code">("password");
  const [loginCodeStep, setLoginCodeStep] = useState<"request" | "verify">("request");
  const [loginCodeOtp, setLoginCodeOtp] = useState("");
  const [loginDevCode, setLoginDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPwVisible, setLoginPwVisible] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [, setForgotSent] = useState(false);

  const [regValue, setRegValue] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regAccept, setRegAccept] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regStep, setRegStep] = useState<"form" | "code">("form");
  const [regCode, setRegCode] = useState("");
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  /** Shown only when `NODE_ENV === 'development'` client build and API returns `devCode`. */
  const [regDevCode, setRegDevCode] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [regPwVisible, setRegPwVisible] = useState(false);
  const [regPw2Visible, setRegPw2Visible] = useState(false);

  const loginRef = useRef<HTMLInputElement | null>(null);
  const regRef = useRef<HTMLInputElement | null>(null);
  const loginCodeRef = useRef<HTMLInputElement | null>(null);

  const showRegPwdTooShort = regPassword.length > 0 && regPassword.trim().length < 6;
  const showRegPwdMismatch = regPassword2.length > 0 && regPassword !== regPassword2;

  useEffect(() => {
    const t = searchParams.get("tab") === "register" ? "register" : "login";
    queueMicrotask(() => setTab(t));
  }, [searchParams]);

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) return;
    router.replace(redirectTo);
  }, [auth.status, auth.userId, redirectTo, router]);

  function resetLoginState() {
    setLoginId("");
    setLoginPassword("");
    setLoginError(null);
    setLoginPwVisible(false);
    setLoginSubMode("password");
    setLoginCodeStep("request");
    setLoginCodeOtp("");
    setLoginDevCode(null);
    setForgotOpen(false);
    setForgotEmail("");
    setForgotBusy(false);
    setForgotSent(false);
  }

  function resetRegisterState() {
    setRegValue("");
    setRegPassword("");
    setRegPassword2("");
    setRegAccept(false);
    setRegStep("form");
    setRegCode("");
    setRegSuccess(null);
    setRegDevCode(null);
    setResendSeconds(0);
    setRegError(null);
    setRegPwVisible(false);
    setRegPw2Visible(false);
  }

  const loginDisabled = useMemo(() => {
    const id = loginId.trim();
    return loading || !id || loginPassword.trim().length < 1;
  }, [loading, loginId, loginPassword]);

  const registerDisabled = useMemo(() => {
    const email = normalizeEmail(regValue);
    const p = regPassword;
    const p2 = regPassword2;
    if (loading) return true;
    if (!email) return true;
    if (p.trim().length < 6) return true;
    if (p !== p2) return true;
    if (!regAccept) return true;
    return false;
  }, [loading, regValue, regPassword, regPassword2, regAccept]);

  const verifyDisabled = useMemo(() => loading || !/^\d{6}$/.test(regCode), [loading, regCode]);
  const loginCodeVerifyDisabled = useMemo(() => loading || !/^\d{6}$/.test(loginCodeOtp), [loading, loginCodeOtp]);

  const headerMode: "login" | "register" | "code" = useMemo(() => {
    if (tab === "login" && loginSubMode === "code") return "code";
    if (tab === "login") return "login";
    return "register";
  }, [tab, loginSubMode]);

  const headerTitle =
    headerMode === "login"
      ? "Вход"
      : headerMode === "register"
        ? "Создайте аккаунт"
        : "Вход";
  const headerSubtitle =
    headerMode === "login"
      ? "Доступ к вашему аккаунту"
      : headerMode === "register"
        ? regStep === "code"
          ? "Введите код из письма"
          : "Email и пароль"
        : loginCodeStep === "verify"
          ? "Введите код из сообщения"
          : "Код из SMS или email";
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = window.setInterval(() => {
      setResendSeconds((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSeconds]);
  
  return (
    <div className="min-h-full bg-gradient-to-b from-black/[0.05] to-black/[0.02] text-black">
      <div className="mx-auto w-full max-w-7xl px-6">
        <header className="flex items-center py-4">
          <BackNavButton className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="pb-16 pt-6">
          <div className="mx-auto w-[calc(100%-32px)] max-w-[500px]">
            <div className="rounded-2xl border border-gray-200 bg-white px-8 py-7 shadow-sm">
              <div className="mb-2 min-h-[34px] text-[21px] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-[24px]">
                <span className="inline-block whitespace-nowrap transition-opacity duration-200">{headerTitle}</span>
              </div>
              <div className="min-h-[20px] text-sm text-gray-600 transition-opacity duration-200">{headerSubtitle}</div>

              <div className="mt-7">
                <div className="grid grid-cols-2 rounded-xl border border-black/10 bg-gray-100 p-1 transition-all">
                  <button
                    type="button"
                    onClick={() => {
                      setTab("login");
                      resetRegisterState();
                      resetLoginState();
                      queueMicrotask(() => loginRef.current?.focus());
                    }}
                    className={[
                      "h-12 rounded-lg text-sm font-semibold transition-all duration-150",
                      tab === "login"
                        ? "bg-white text-black shadow-sm ring-1 ring-black/5"
                        : "bg-gray-100 text-black/60 hover:text-black",
                    ].join(" ")}
                  >
                    Вход
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("register");
                      resetLoginState();
                      resetRegisterState();
                      queueMicrotask(() => regRef.current?.focus());
                    }}
                    className={[
                      "h-12 rounded-lg text-sm font-semibold transition-all duration-150",
                      tab === "register"
                        ? "bg-white text-black shadow-sm ring-1 ring-black/5"
                        : "bg-gray-100 text-black/60 hover:text-black",
                    ].join(" ")}
                  >
                    Регистрация
                  </button>
                </div>
              </div>

              {tab === "login" ? (
                loginSubMode === "password" ? (
                  <form
                    className="mt-7 grid gap-[18px]"
                    autoComplete="off"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (loading) return;
                      const id = loginId.trim();
                      if (!id) {
                        setLoginError("Укажите email или телефон");
                        loginRef.current?.focus();
                        return;
                      }
                      if (!loginPassword.trim()) {
                        setLoginError("Введите пароль");
                        return;
                      }
                      setLoginError(null);
                      setLoading(true);
                      try {
                        const response = await fetch("/api/auth/login", {
                          method: "POST",
                          credentials: "include",
                          cache: "no-store",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ value: id, password: loginPassword }),
                        });
                        const data = (await response.json().catch(() => ({}))) as { error?: string; user?: { userId: string } };
                        if (!response.ok) {
                          if (data.error === "NOT_FOUND") setLoginError("Аккаунт не найден. Зарегистрируйтесь.");
                          else setLoginError("Неверный email/телефон или пароль.");
                          return;
                        }
                        const uidPw = (data.user?.userId ?? "").trim();
                        setSession(uidPw, id);
                        if (uidPw) rememberCurrentSession(uidPw, id);
                        getOrCreateOwnerId();
                        void pingPresenceThrottled({ force: true });
                        router.push(redirectTo);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-black/80">Email или телефон</span>
                      <input
                        ref={loginRef}
                        name="auth_identifier_temp"
                        value={loginId}
                        onChange={(e) => {
                          setLoginId(e.target.value);
                          if (loginError) setLoginError(null);
                        }}
                        className={[
                          "h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition-shadow",
                          "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                          loginError ? "border-red-300" : "border-black/15",
                        ].join(" ")}
                        placeholder="Email или телефон"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={loading}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-black/80">Пароль</span>
                      <div className="relative">
                        <input
                          name="auth_password_temp"
                          value={loginPassword}
                          onChange={(e) => {
                            setLoginPassword(e.target.value);
                            if (loginError) setLoginError(null);
                          }}
                          type={loginPwVisible ? "text" : "password"}
                          className={[
                            "h-12 w-full rounded-xl border bg-white px-4 pr-11 text-[15px] outline-none transition-shadow",
                            "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                            loginError ? "border-red-300" : "border-black/15",
                          ].join(" ")}
                          placeholder="Пароль"
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          aria-label={loginPwVisible ? "Скрыть пароль" : "Показать пароль"}
                          onClick={() => setLoginPwVisible((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                        >
                          {loginPwVisible ? "🙈" : "👁"}
                        </button>
                      </div>
                    </label>

                    {loginError ? <div className="text-sm text-red-700">{loginError}</div> : null}

                    <button
                      type="submit"
                      disabled={loginDisabled}
                      className={[
                        "mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white opacity-100",
                        "bg-[#ff5a00] shadow-[0_6px_14px_rgba(255,90,0,0.25)] transition-all active:scale-[0.99]",
                        "hover:bg-[#e94f00]",
                        "disabled:cursor-not-allowed disabled:bg-[#ffb38a] disabled:opacity-[0.55]",
                      ].join(" ")}
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z"
                            />
                          </svg>
                          Вход…
                        </span>
                      ) : (
                        "Войти"
                      )}
                    </button>

                    <div className="grid gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-black/10" />
                        <span className="text-xs font-medium uppercase tracking-wide text-black/45">или</span>
                        <div className="h-px flex-1 bg-black/10" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginError(null);
                          setLoginPassword("");
                          setLoginSubMode("code");
                          setLoginCodeStep("request");
                          setLoginCodeOtp("");
                          setLoginDevCode(null);
                          queueMicrotask(() => loginRef.current?.focus());
                        }}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.03]"
                      >
                        Войти по коду
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <button
                        type="button"
                        className="text-black/60 hover:text-black hover:underline"
                        onClick={() => {
                          setTab("register");
                          resetLoginState();
                          resetRegisterState();
                          queueMicrotask(() => regRef.current?.focus());
                        }}
                      >
                        Нет аккаунта? Зарегистрироваться
                      </button>
                      <button
                        type="button"
                        className="text-black/50 hover:text-black hover:underline"
                        onClick={() => {
                          setForgotSent(false);
                          setForgotEmail("");
                          setForgotOpen(true);
                        }}
                      >
                        Забыли пароль?
                      </button>
                    </div>
                  </form>
                ) : (
                  <form
                    className="mt-7 grid gap-[18px]"
                    autoComplete="off"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (loading) return;
                      setLoginError(null);
                      const raw = loginId;
                      const normalizedEmail = raw.trim().toLowerCase();
                      const typeEmail = raw.includes("@");
                      const normalizedPhone = normalizePhone(raw);
                      const normalized = typeEmail ? normalizedEmail : normalizedPhone;
                      if (loginCodeStep === "request") {
                        if (!raw) {
                          setLoginError("Укажите email или телефон");
                          loginRef.current?.focus();
                          return;
                        }
                        if (typeEmail) {
                          if (!isValidEmail(normalizedEmail)) {
                            setLoginError("Укажите корректный email");
                            loginRef.current?.focus();
                            return;
                          }
                        } else if (!normalized || !isValidPhone(raw)) {
                          setLoginError(PHONE_VALIDATION_MESSAGE);
                          loginRef.current?.focus();
                          return;
                        }
                        setLoading(true);
                        try {
                          const reqType: "email" | "phone" = typeEmail ? "email" : "phone";
                          const reqValue = reqType === "email" ? normalizedEmail : normalizedPhone;
                          const response = await fetch("/api/send-code", {
                            method: "POST",
                            credentials: "include",
                            cache: "no-store",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: reqType,
                              value: reqValue,
                            }),
                          });
                          const data = (await response.json().catch(() => ({}))) as { error?: string; devCode?: string };
                          if (!response.ok) {
                            setLoginError(data.error ?? "Не удалось отправить код");
                            return;
                          }
                          const dc = typeof data.devCode === "string" && /^\d{6}$/.test(data.devCode) ? data.devCode : null;
                          setLoginDevCode(process.env.NODE_ENV === "development" ? dc : null);
                          setLoginCodeStep("verify");
                          setLoginCodeOtp("");
                          queueMicrotask(() => loginCodeRef.current?.focus());
                        } finally {
                          setLoading(false);
                        }
                        return;
                      }

                      if (!/^\d{6}$/.test(loginCodeOtp.trim())) return;
                      setLoading(true);
                      try {
                        const response = await fetch("/api/verify-code", {
                          method: "POST",
                          credentials: "include",
                          cache: "no-store",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            value: normalized,
                            code: loginCodeOtp.trim(),
                          }),
                        });
                        const data = (await response.json().catch(() => ({}))) as {
                          error?: string;
                          user?: { userId: string };
                        };
                        if (!response.ok) {
                          setLoginError(data.error ?? "Неверный код");
                          return;
                        }
                        const uid = (data.user?.userId ?? "").trim();
                        if (!uid) {
                          setLoginError("Аккаунт не найден. Зарегистрируйтесь.");
                          return;
                        }
                        setSession(uid, raw);
                        rememberCurrentSession(uid, raw);
                        getOrCreateOwnerId();
                        void pingPresenceThrottled({ force: true });
                        router.push(redirectTo);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setLoginSubMode("password");
                        setLoginCodeStep("request");
                        setLoginCodeOtp("");
                        setLoginError(null);
                      }}
                      className="w-fit text-sm text-black/55 hover:text-black hover:underline"
                    >
                      ← Войти с паролем
                    </button>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-black/80">
                        Email или телефон
                      </span>
                      <input
                        ref={loginRef}
                        name="auth_code_identifier_temp"
                        value={loginId}
                        onChange={(e) => {
                          setLoginId(e.target.value);
                          if (loginError) setLoginError(null);
                        }}
                        readOnly={loginCodeStep === "verify"}
                        className={[
                          "h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition-shadow read-only:bg-black/[0.03]",
                          "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                          loginError ? "border-red-300" : "border-black/15",
                        ].join(" ")}
                        placeholder="Email или телефон"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={loading}
                      />
                      {loginCodeStep === "request" && !loginId.includes("@") ? (
                        <p className="text-xs leading-snug text-black/55">{SMS_LOGIN_CODE_PHONE_HINT}</p>
                      ) : null}
                    </label>

                    {loginCodeStep === "verify" ? (
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-black/80">Введите код</span>
                        <input
                          ref={loginCodeRef}
                          name="auth_code_otp_temp"
                          value={loginCodeOtp}
                          onChange={(e) => {
                            setLoginCodeOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                            if (loginError) setLoginError(null);
                          }}
                          className={[
                            "h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition-shadow",
                            "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                            loginError ? "border-red-300" : "border-black/15",
                          ].join(" ")}
                          placeholder="000000"
                          inputMode="numeric"
                          disabled={loading}
                        />
                      </label>
                    ) : null}

                    {process.env.NODE_ENV === "development" && loginCodeStep === "verify" && loginDevCode ? (
                      <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                        Код для разработки: {loginDevCode}
                      </div>
                    ) : null}

                    {loginError ? <div className="text-sm text-red-700">{loginError}</div> : null}

                    {loginCodeStep === "request" ? (
                      <>
                        <button
                          type="submit"
                          disabled={
                            loading ||
                            !loginId.trim() ||
                            (loginId.trim().includes("@")
                              ? !isValidEmail(loginId.trim().toLowerCase())
                              : !normalizePhone(loginId.trim()) || !isValidPhone(loginId.trim()))
                          }
                          className={[
                            "mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white opacity-100",
                            "bg-[#ff5a00] shadow-[0_6px_14px_rgba(255,90,0,0.25)] transition-all active:scale-[0.99]",
                            "hover:bg-[#e94f00]",
                            "disabled:cursor-not-allowed disabled:bg-[#ffb38a] disabled:opacity-[0.55]",
                          ].join(" ")}
                        >
                          {loading ? "Отправка…" : "Получить код"}
                        </button>
                        {loginId.trim().includes("@") ? (
                          <p className="mt-2 text-xs leading-snug text-black/55">
                            Код подтверждения может попасть в папку «Спам»
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="submit"
                        disabled={loginCodeVerifyDisabled}
                        className={[
                          "mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white opacity-100",
                          "bg-[#ff5a00] shadow-[0_6px_14px_rgba(255,90,0,0.25)] transition-all active:scale-[0.99]",
                          "hover:bg-[#e94f00]",
                          "disabled:cursor-not-allowed disabled:bg-[#ffb38a] disabled:opacity-[0.55]",
                        ].join(" ")}
                      >
                        {loading ? "Вход…" : "Войти"}
                      </button>
                    )}
                  </form>
                )
              ) : (
                <form
                  className="mt-7 grid gap-[18px]"
                  autoComplete="off"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (loading) return;
                    setRegError(null);
                    setRegSuccess(null);
                    setRegDevCode(null);

                    const normalizedEmail = regValue.trim().toLowerCase();
                    const email = normalizeEmail(normalizedEmail);
                    if (regStep === "form") {
                      if (!isValidEmail(normalizedEmail)) {
                        setRegError("Укажите корректный email");
                        regRef.current?.focus();
                        return;
                      }
                      if (regPassword.trim().length < 6) {
                        setRegError("Пароль должен быть не короче 6 символов");
                        return;
                      }
                      if (regPassword !== regPassword2) {
                        setRegError("Пароли не совпадают");
                        return;
                      }
                      if (!regAccept) {
                        setRegError("Необходимо принять условия и политику конфиденциальности");
                        return;
                      }

                      setLoading(true);
                      try {
                        const response = await fetch("/api/auth/request-registration-code", {
                          method: "POST",
                          credentials: "include",
                          cache: "no-store",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            confirmMethod: "email",
                            email,
                            password: regPassword,
                          }),
                        });
                        const data = (await response.json().catch(() => ({}))) as {
                          error?: string;
                          cooldownSec?: number;
                          devCode?: string;
                        };
                        if (!response.ok) {
                          setRegError(data.error ?? "Не удалось отправить код");
                          return;
                        }
                        setRegStep("code");
                        setRegCode("");
                        setRegSuccess("Код отправлен");
                        const dc = typeof data.devCode === "string" && /^\d{6}$/.test(data.devCode) ? data.devCode : null;
                        setRegDevCode(dc);
                        setResendSeconds(60);
                      } finally {
                        setLoading(false);
                      }
                      return;
                    }

                    setLoading(true);
                    try {
                      const response = await fetch("/api/auth/verify-registration-code", {
                        method: "POST",
                        credentials: "include",
                        cache: "no-store",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          confirmMethod: "email",
                          email,
                          code: regCode.trim(),
                        }),
                      });
                      const data = (await response.json().catch(() => ({}))) as { error?: string; user?: { userId: string } };
                      if (!response.ok) {
                        setRegError(data.error ?? "Не удалось подтвердить код");
                        return;
                      }
                      const uid = (data.user?.userId ?? "").trim();
                      if (uid) {
                        setRegSuccess("Подтверждение успешно");
                        setSession(uid, email);
                        rememberCurrentSession(uid, email);
                        getOrCreateOwnerId();
                        void pingPresenceThrottled({ force: true });
                        router.push(redirectTo);
                        return;
                      }
                      setRegError("Не удалось завершить регистрацию");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {regStep === "form" ? (
                    <>
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-black/80">Email</span>
                        <input
                          ref={regRef}
                          name="auth_register_value_temp"
                          value={regValue}
                          onChange={(e) => {
                            setRegValue(e.target.value);
                            if (regError) setRegError(null);
                          }}
                          className={[
                            "h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition-shadow",
                            "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                            regError ? "border-red-300" : "border-black/15",
                          ].join(" ")}
                          placeholder="Email"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={loading}
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-black/80">Пароль</span>
                        <div className="relative">
                          <input
                            name="auth_register_password_temp"
                            value={regPassword}
                            onChange={(e) => {
                              setRegPassword(e.target.value);
                              if (regError) setRegError(null);
                            }}
                            type={regPwVisible ? "text" : "password"}
                            className={[
                              "h-12 w-full rounded-xl border bg-white px-4 pr-11 text-[15px] outline-none transition-shadow",
                              "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                              regError ? "border-red-300" : "border-black/15",
                            ].join(" ")}
                            placeholder="Пароль"
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            aria-label={regPwVisible ? "Скрыть пароль" : "Показать пароль"}
                            onClick={() => setRegPwVisible((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                          >
                            {regPwVisible ? "🙈" : "👁"}
                          </button>
                        </div>
                        {showRegPwdTooShort ? (
                          <div className="text-sm text-red-700">Пароль должен быть не короче 6 символов</div>
                        ) : null}
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-black/80">Повторите пароль</span>
                        <div className="relative">
                          <input
                            name="auth_register_password2_temp"
                            value={regPassword2}
                            onChange={(e) => {
                              setRegPassword2(e.target.value);
                              if (regError) setRegError(null);
                            }}
                            type={regPw2Visible ? "text" : "password"}
                            className={[
                              "h-12 w-full rounded-xl border bg-white px-4 pr-11 text-[15px] outline-none transition-shadow",
                              "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                              regError ? "border-red-300" : "border-black/15",
                            ].join(" ")}
                            placeholder="Повторите пароль"
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            aria-label={regPw2Visible ? "Скрыть пароль" : "Показать пароль"}
                            onClick={() => setRegPw2Visible((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                          >
                            {regPw2Visible ? "🙈" : "👁"}
                          </button>
                        </div>
                        {showRegPwdMismatch ? <div className="text-sm text-red-700">Пароли не совпадают</div> : null}
                      </label>

                      <label
                        htmlFor="reg-accept-consent"
                        className="mt-1 flex cursor-pointer items-start gap-3 text-sm text-black/70"
                      >
                        <input
                          id="reg-accept-consent"
                          type="checkbox"
                          checked={regAccept}
                          onChange={(e) => {
                            setRegAccept(e.target.checked);
                            if (regError) setRegError(null);
                          }}
                          className="mt-1 h-4 w-4 cursor-pointer rounded border-black/20"
                          disabled={loading}
                        />
                        <span className="min-w-0 pt-px leading-snug">
                          Я принимаю условия и{" "}
                          <Link
                            href="/privacy"
                            className="cursor-pointer font-medium text-[#2563eb] underline underline-offset-[2px] hover:underline hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/35"
                            onClick={(e) => e.stopPropagation()}
                          >
                            политику конфиденциальности
                          </Link>
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-black/60">{`Мы отправили код на ${normalizeEmail(regValue)}`}</div>
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-black/80">Введите код</span>
                        <input
                          name="auth_register_code_temp"
                          value={regCode}
                          onChange={(e) => {
                            setRegCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                            if (regError) setRegError(null);
                          }}
                          className={[
                            "h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition-shadow",
                            "focus:border-orange-500 focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]",
                            regError ? "border-red-300" : "border-black/15",
                          ].join(" ")}
                          placeholder="000000"
                          inputMode="numeric"
                          disabled={loading}
                        />
                      </label>
                    </>
                  )}

                  {regError ? <div className="text-sm text-red-700">{regError}</div> : null}
                  {regSuccess ? <div className="text-sm text-green-700">{regSuccess}</div> : null}
                  {process.env.NODE_ENV === "development" && regStep === "code" && regDevCode ? (
                    <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      Код для разработки: {regDevCode}
                    </div>
                  ) : null}

                  {regStep === "form" ? (
                    <>
                      <button
                        type="submit"
                        disabled={registerDisabled}
                        className={[
                          "mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white opacity-100",
                          "bg-[#ff5a00] shadow-[0_6px_14px_rgba(255,90,0,0.25)] transition-all active:scale-[0.99]",
                          "hover:bg-[#e94f00]",
                          "disabled:cursor-not-allowed disabled:bg-[#ffb38a] disabled:opacity-[0.55]",
                        ].join(" ")}
                      >
                        {loading ? "Отправка…" : "Зарегистрироваться"}
                      </button>
                      <p className="mt-2 text-xs leading-snug text-black/55">
                        Код подтверждения может попасть в папку «Спам»
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        type="submit"
                        disabled={verifyDisabled}
                        className={[
                          "mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white opacity-100",
                          "bg-[#ff5a00] shadow-[0_6px_14px_rgba(255,90,0,0.25)] transition-all active:scale-[0.99]",
                          "hover:bg-[#e94f00]",
                          "disabled:cursor-not-allowed disabled:bg-[#ffb38a] disabled:opacity-[0.55]",
                        ].join(" ")}
                      >
                        {loading ? "Проверка…" : "Подтвердить и создать аккаунт"}
                      </button>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={loading || resendSeconds > 0}
                          onClick={async () => {
                            setRegError(null);
                            setRegSuccess(null);
                            setRegDevCode(null);
                            setLoading(true);
                            try {
                              const email = normalizeEmail(regValue.trim().toLowerCase());
                              const response = await fetch("/api/auth/request-registration-code", {
                                method: "POST",
                                credentials: "include",
                                cache: "no-store",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  confirmMethod: "email",
                                  email,
                                  password: regPassword,
                                }),
                              });
                              const data = (await response.json().catch(() => ({}))) as {
                                error?: string;
                                cooldownSec?: number;
                                devCode?: string;
                              };
                                if (!response.ok) {
                                  setRegError(data.error ?? "Не удалось отправить код");
                                return;
                              }
                              setResendSeconds(60);
                              setRegSuccess("Код отправлен повторно");
                              const dc = typeof data.devCode === "string" && /^\d{6}$/.test(data.devCode) ? data.devCode : null;
                              setRegDevCode(dc);
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                        >
                          {resendSeconds > 0
                            ? `Отправить код повторно через ${resendSeconds} сек`
                            : "Отправить код ещё раз"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRegStep("form");
                            setRegCode("");
                            setRegError(null);
                            setRegSuccess(null);
                          }}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
                        >
                          Изменить данные
                        </button>
                      </div>
                    </>
                  )}

                  <div className="mt-2 text-sm">
                    <button
                      type="button"
                      className="text-black/60 hover:text-black hover:underline"
                      onClick={() => {
                        setTab("login");
                        resetRegisterState();
                        resetLoginState();
                        queueMicrotask(() => loginRef.current?.focus());
                      }}
                    >
                      Уже есть аккаунт? Войти
                    </button>
                  </div>
                </form>
              )}

              {forgotOpen ? (
                <div
                  className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-[max(1rem,calc(1rem+env(safe-area-inset-top)))] pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:items-center sm:pt-4 sm:pb-4"
                  onClick={() => {
                    if (!forgotBusy) setForgotOpen(false);
                  }}
                  role="presentation"
                >
                  <div
                    className="my-auto w-full max-w-[440px] max-h-[85dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Сброс пароля"
                  >
                    <div className="text-base font-semibold text-black/90">Сброс пароля</div>
                    <div className="mt-1 text-sm text-black/60">Укажите email, на который зарегистрирован аккаунт.</div>

                    <form
                      className="mt-4 grid gap-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (forgotBusy) return;
                        setForgotBusy(true);
                        setForgotSent(true);
                        try {
                          await fetch("/api/auth/forgot-password", {
                            method: "POST",
                            credentials: "include",
                            cache: "no-store",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: forgotEmail }),
                          });
                        } finally {
                          setForgotBusy(false);
                        }
                      }}
                    >
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Email</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                          disabled={forgotBusy}
                        />
                      </label>

                      <div className="text-sm text-black/70">Если email существует — инструкция отправлена</div>

                      <div className="mt-1 flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={forgotBusy}
                          onClick={() => setForgotOpen(false)}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                        >
                          Закрыть
                        </button>
                        <button
                          type="submit"
                          disabled={forgotBusy || !forgotEmail.trim()}
                          className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                          style={{ backgroundColor: "#ff7a00" }}
                        >
                          {forgotBusy ? "Отправляем…" : "Отправить"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

