"use client";

import type { ChatUploadKind } from "../../lib/chatUploadConstraints";
import type { ChatSafetyWarning } from "../../lib/chatSafety";

export type PendingChatAttachment = {
  id: string;
  file: File;
  kind: ChatUploadKind;
  previewUrl: string | null;
};

export function ChatComposerMarketplace({
  safetyWarning,
  pending,
  uploadProgress,
  onRemovePending,
}: {
  disabled?: boolean;
  safetyWarning: ChatSafetyWarning | null;
  pending: PendingChatAttachment[];
  uploadProgress?: { current: number; total: number } | null;
  onRemovePending: (id: string) => void;
}) {
  return (
    <div className="mb-2 space-y-2">
      {safetyWarning ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950/90">
          {safetyWarning.message}
        </div>
      ) : null}

      {uploadProgress && uploadProgress.total > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-black/50">
            <span>Загрузка…</span>
            <span>
              {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-black/10"
            role="progressbar"
            aria-valuenow={uploadProgress.current}
            aria-valuemin={0}
            aria-valuemax={uploadProgress.total}
          >
            <div
              className="h-full rounded-full bg-orange-500 transition-[width] duration-200"
              style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="relative flex max-w-[120px] flex-col rounded-xl border border-black/10 bg-black/[0.02] p-1.5"
            >
              <button
                type="button"
                className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full border border-black/10 bg-white text-xs text-black/60"
                onClick={() => onRemovePending(p.id)}
                aria-label="Убрать"
              >
                ×
              </button>
              {p.previewUrl && p.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt="" className="h-16 w-full rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-16 items-center justify-center px-1 text-center text-[10px] text-black/55">
                  {p.kind === "voice" ? "Голос" : p.file.name}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
