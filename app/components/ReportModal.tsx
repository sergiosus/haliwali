"use client";

import { useState } from "react";
import { REPORT_REASON_OPTIONS, type ReportReasonKey } from "../lib/reportReasons";

export function ReportModal({
  open,
  targetType,
  targetId,
  onClose,
  onDone,
}: {
  open: boolean;
  targetType: "listing" | "user";
  targetId: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState<ReportReasonKey | "">("");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (!reason) {
      setError("Выберите причину");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          comment: comment.trim(),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(data.error === "UNAUTHORIZED" ? "Войдите, чтобы пожаловаться" : data.error ?? "Не удалось отправить");
        return;
      }
      setReason("");
      setComment("");
      onDone?.();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Пожаловаться"
      >
        <div className="text-lg font-semibold text-black/90">Пожаловаться</div>
        <div className="mt-4 grid gap-2">
          {REPORT_REASON_OPTIONS.map((o) => (
            <label key={o.key} className="flex cursor-pointer items-center gap-2 text-sm text-black/80">
              <input
                type="radio"
                name="report-reason"
                checked={reason === o.key}
                onChange={() => setReason(o.key)}
                className="accent-[#ff7a00]"
              />
              {o.label}
            </label>
          ))}
        </div>
        <label className="mt-4 block text-sm text-black/70">
          Комментарий (необязательно)
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm text-black outline-none placeholder:text-black/40"
            placeholder="Кратко опишите ситуацию"
          />
        </label>
        {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-60"
            style={{ backgroundColor: "#ff7a00" }}
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
