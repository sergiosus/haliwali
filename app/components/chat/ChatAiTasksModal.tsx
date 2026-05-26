"use client";

export type ChatAiTaskUi = {
  title: string;
  deadlineText: string;
  assigneeText: string;
  sourceType: string;
  sourceRef?: string;
};

export function ChatAiTasksModal({
  open,
  loading,
  error,
  tasks,
  saveBusy,
  saveDone,
  onClose,
  onCopy,
  onSave,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  tasks: ChatAiTaskUi[];
  saveBusy: boolean;
  saveDone: boolean;
  onClose: () => void;
  onCopy: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(85dvh,560px)] w-full max-w-[520px] flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Создать задачи"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div className="text-base font-semibold text-black/90">Создать задачи</div>
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
            <div className="py-8 text-center text-sm text-black/55">Ищем задачи в переписке…</div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
              {error}
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/60">
              Задачи не найдены.
            </div>
          ) : (
            <div className="grid gap-2">
              {tasks.map((task, idx) => (
                <div key={`${idx}-${task.title}`} className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5">
                  <div className="text-sm font-semibold text-black/90">{task.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-black/55">
                    <span>Срок: {task.deadlineText || "без срока"}</span>
                    {task.assigneeText ? <span>Ответственный: {task.assigneeText}</span> : null}
                    {task.sourceRef ? <span>Источник: {task.sourceRef}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-black/10 px-4 py-3">
          <button
            type="button"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-black/15 bg-white px-3 text-sm font-semibold text-black/80 hover:bg-black/[0.03] disabled:opacity-50 sm:flex-none sm:px-4"
            disabled={tasks.length === 0 || loading}
            onClick={onCopy}
          >
            Копировать
          </button>
          <button
            type="button"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 sm:flex-none sm:px-4"
            disabled={tasks.length === 0 || loading || saveBusy || saveDone}
            onClick={onSave}
          >
            {saveDone ? "Сохранено" : saveBusy ? "Сохранение…" : "Сохранить задачи"}
          </button>
        </div>
      </div>
    </div>
  );
}
