"use client";

export function ChatAiQuickReplies({
  visible,
  loading,
  error,
  replies,
  onPick,
  onDismiss,
}: {
  visible: boolean;
  loading: boolean;
  error: string | null;
  replies: string[];
  onPick: (text: string) => void;
  onDismiss: () => void;
}) {
  if (!visible && !loading) return null;

  return (
    <div className="mb-2 rounded-2xl border border-black/10 bg-black/[0.02] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-black/45">AI ответ</div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-black/50 hover:bg-black/[0.05]"
          onClick={onDismiss}
          aria-label="Скрыть подсказки"
          disabled={loading}
        >
          ×
        </button>
      </div>

      {loading ? (
        <div className="mt-2 text-sm text-black/55">Подбираем варианты…</div>
      ) : error ? (
        <div className="mt-2 text-sm text-amber-900">{error}</div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {replies.map((reply, idx) => (
            <button
              key={`${idx}-${reply.slice(0, 24)}`}
              type="button"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-left text-sm leading-snug text-black/80 hover:border-orange-200 hover:bg-orange-50/50"
              onClick={() => onPick(reply)}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
