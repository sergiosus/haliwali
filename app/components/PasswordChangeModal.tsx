"use client";

import { useEffect, useRef, useState } from "react";

const inputClass =
  "h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]";

type Props = {
  apiPath: "/api/account/change-password" | "/api/admin/change-password";
  /** Dialog title ("Смена пароля администратора", etc.). */
  dialogTitle?: string;
  /** Hide the floating trigger button; open via `open` / `onOpenChange` instead. Default true (admin). */
  showTrigger?: boolean;
  /** Controlled open state — use with `onOpenChange` and `showTrigger={false}` (кабинет). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function PasswordChangeModal({
  apiPath,
  dialogTitle = "Смена пароля",
  showTrigger = true,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const open = isControlled ? Boolean(controlledOpen) : internalOpen;

  function setOpenState(next: boolean) {
    onOpenChange?.(next);
    if (!isControlled) setInternalOpen(next);
  }
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCloseTimer() {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFeedback(null);
  }

  function closeModal() {
    clearCloseTimer();
    setOpenState(false);
    resetFields();
  }

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    setBusy(true);
    try {
      const r = await fetch(apiPath, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      const msg =
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : "";
      if (r.ok && data.ok) {
        setFeedback({
          kind: "ok",
          text: msg || (apiPath === "/api/admin/change-password" ? "Пароль администратора успешно изменён." : "Пароль успешно изменён."),
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          setOpenState(false);
          setFeedback(null);
        }, 1800);
      } else {
        setFeedback({
          kind: "err",
          text: msg || "Не удалось изменить пароль. Попробуйте позже.",
        });
      }
    } catch {
      setFeedback({ kind: "err", text: "Не удалось изменить пароль. Попробуйте позже." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => {
            clearCloseTimer();
            resetFields();
            setOpenState(true);
          }}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
        >
          Сменить пароль
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4"
          onClick={() => {
            if (!busy) closeModal();
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={dialogTitle}
          >
            <div className="text-base font-semibold text-black/90">{dialogTitle}</div>
            <form className="mt-4 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Текущий пароль</span>
                <input
                  type="password"
                  name="current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Новый пароль</span>
                <input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-black/45">Повторите новый пароль</span>
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              {feedback?.kind === "ok" ? <div className="text-sm text-green-700">{feedback.text}</div> : null}
              {feedback?.kind === "err" ? <div className="text-sm text-red-700">{feedback.text}</div> : null}
              <div className="mt-1 flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => closeModal()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                  style={{ backgroundColor: "#ff7a00" }}
                >
                  {busy ? "Подождите…" : "Сменить пароль"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
