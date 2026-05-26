"use client";

export function ChatAiSummaryModal({
  open,
  loading,
  error,
  summary,
  saveBusy,
  saveDone,
  onClose,
  onCopy,
  onSave,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  summary: string | null;
  saveBusy: boolean;
  saveDone: boolean;
  onClose: () => void;
  onCopy: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(85dvh,560px)] w-full max-w-[440px] flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI summary"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div className="text-base font-semibold text-black/90">AI summary</div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg text-black/50 hover:bg-black/[0.05]"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-black/55">Формируем итог…</div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
              {error}
            </div>
          ) : summary ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-black/80">{summary}</pre>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-black/10 px-4 py-3">
          <button
            type="button"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-black/15 bg-white px-3 text-sm font-semibold text-black/80 hover:bg-black/[0.03] disabled:opacity-50 sm:flex-none sm:px-4"
            disabled={!summary || loading}
            onClick={onCopy}
          >
            Копировать
          </button>
          <button
            type="button"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 sm:flex-none sm:px-4"
            disabled={!summary || loading || saveBusy || saveDone}
            onClick={onSave}
          >
            {saveDone ? "Сохранено" : saveBusy ? "Сохранение…" : "Сохранить итог"}
          </button>
        </div>
      </div>
    </div>
  );
}
