"use client";

export function ClientToolsSuggestionBanner({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/70 px-3 py-3 text-sm text-orange-950">
      <div className="font-medium">Попробовать инструменты для работы с клиентами?</div>
      <p className="mt-1 text-orange-900/85">
        Статусы, заметки и краткий итог переписки — только внутри чатов, без лишних экранов.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEnable}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600"
        >
          Включить
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50/80"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
