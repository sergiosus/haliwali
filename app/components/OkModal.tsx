"use client";

export function OkModal({
  open,
  title,
  subtitle,
  confirmLabel = "Понятно",
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-5 shadow-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ok-modal-title"
      >
        <div id="ok-modal-title" className="text-lg font-semibold tracking-tight">
          {title}
        </div>
        {subtitle ? <div className="mt-2 text-sm leading-relaxed text-black/70">{subtitle}</div> : null}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
