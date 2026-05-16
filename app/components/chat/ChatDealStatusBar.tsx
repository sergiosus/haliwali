"use client";

import {
  CHAT_DEAL_STATUS_LABELS,
  CHAT_DEAL_STATUSES,
  type ChatDealStatus,
} from "../../lib/chatDealStatus";

export function ChatDealStatusBar({
  value,
  disabled,
  onChange,
}: {
  value: ChatDealStatus;
  disabled?: boolean;
  onChange: (next: ChatDealStatus) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-black/10 bg-black/[0.02] px-3 py-2 scrollbar-none">
      {CHAT_DEAL_STATUSES.map((st) => {
        const active = st === value;
        return (
          <button
            key={st}
            type="button"
            disabled={disabled}
            onClick={() => onChange(st)}
            className={[
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              active
                ? "border-orange-200 bg-orange-50 text-orange-800"
                : "border-black/10 bg-white text-black/65 hover:bg-black/[0.03]",
              disabled ? "opacity-50" : "",
            ].join(" ")}
          >
            {CHAT_DEAL_STATUS_LABELS[st]}
          </button>
        );
      })}
    </div>
  );
}
