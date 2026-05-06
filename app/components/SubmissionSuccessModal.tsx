"use client";

import { useMemo, useState } from "react";
import type { ListingStatus } from "../lib/listings";

function shortenEditPath(editPath: string) {
  const token = editPath.split("/").filter(Boolean).pop() ?? editPath;
  if (token.length <= 12) return `/edit/${token}`;
  return `/edit/${token.slice(0, 6)}...${token.slice(-6)}`;
}

export function SubmissionSuccessModal({
  open,
  onClose,
  editPath,
  status,
}: {
  open: boolean;
  onClose: () => void;
  editPath: string | null;
  status: ListingStatus | null;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const fullUrl = useMemo(() => {
    if (!editPath) return "";
    if (!origin) return editPath;
    return `${origin}${editPath}`;
  }, [editPath, origin]);

  if (!open || !editPath) return null;

  const subtitle =
    status === "auto"
      ? "Объявление опубликовано автоматически."
      : "Объявление отправлено на проверку.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-5 shadow-xl sm:p-6">
        <div className="text-lg font-semibold tracking-tight">Объявление отправлено</div>
        <div className="mt-1 text-sm text-black/60">{subtitle}</div>

        <div className="mt-4 text-sm text-black/60">Ссылка для редактирования:</div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-black/10 bg-black/[0.03] px-3 py-2">
            <a
              href={editPath}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-black/80 hover:text-black"
              title={fullUrl}
            >
              {shortenEditPath(editPath)}
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fullUrl || editPath);
                  setCopyState("copied");
                  window.setTimeout(() => setCopyState("idle"), 1200);
                } catch {
                  setCopyState("error");
                }
              }}
              className="h-9 flex-none rounded-2xl border border-black/10 bg-white px-3 text-sm font-semibold text-black hover:bg-black/5"
            >
              {copyState === "copied" ? "Скопировано" : "Скопировать ссылку"}
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-black/50">
          Если вы потеряете ссылку, вы не сможете редактировать объявление.
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <a
            href={editPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
            style={{ backgroundColor: "#ff7a00" }}
          >
            Перейти к редактированию
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

