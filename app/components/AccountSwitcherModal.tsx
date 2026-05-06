"use client";

import type { RememberedAccount } from "../lib/rememberedAccounts";

export type AccountSwitcherCurrentUser = {
  avatarSrc: string;
  primaryLabel: string;
  secondaryContact: string;
};

export function AccountSwitcherModal({
  isOpen,
  onClose,
  currentUser,
  currentUserId,
  rememberedAccounts,
  onLogout,
  onAddAccount,
  onSelectAccount,
  onRemoveFromList,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AccountSwitcherCurrentUser;
  currentUserId: string | null;
  rememberedAccounts: RememberedAccount[];
  onLogout: () => void;
  onAddAccount: () => void;
  onSelectAccount: (account: RememberedAccount) => void;
  onRemoveFromList: (userId: string) => void;
}) {
  if (!isOpen) return null;

  const { avatarSrc, primaryLabel, secondaryContact } = currentUser;
  const initialLetter = primaryLabel.trim().slice(0, 1).toUpperCase() || "U";

  /** Порядок: запомнённые, активный помечен; дедуп по userId */
  const byId = new Map<string, RememberedAccount>();
  for (const a of rememberedAccounts) {
    if (a.userId) byId.set(a.userId, a);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-switcher-title"
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-xl leading-none text-gray-600 hover:bg-gray-50"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="border-b border-gray-100 px-6 py-4 pr-14">
          <h2 id="account-switcher-title" className="text-lg font-semibold text-gray-900">
            Переключить аккаунт
          </h2>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full border border-black/10 object-cover"
              />
            ) : (
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-gray-100 text-sm font-semibold text-gray-600">
                {initialLetter}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate font-medium text-gray-900">{primaryLabel}</span>
                <span className="shrink-0 text-green-600" aria-label="Текущий аккаунт" title="Текущий аккаунт">
                  ✓
                </span>
              </div>
              <div className="mt-1 truncate text-sm text-gray-500">{secondaryContact}</div>
              {currentUserId ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromList(currentUserId);
                  }}
                  className="mt-2 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
                >
                  Убрать из списка
                </button>
              ) : null}
            </div>
          </div>

          {[...byId.values()]
            .filter((a) => a.userId && a.userId !== currentUserId)
            .map((acc) => (
              <div
                key={acc.userId}
                className="mt-3 flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onSelectAccount(acc)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left transition-colors hover:opacity-90"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-gray-50 text-xs font-semibold uppercase text-gray-700">
                    {acc.avatarInitials || acc.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{acc.displayName}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{acc.loginLabel}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromList(acc.userId);
                  }}
                  className="shrink-0 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
                >
                  Убрать из списка
                </button>
              </div>
            ))}

          <button
            type="button"
            onClick={onLogout}
            className="mt-4 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Выйти
          </button>

          <button
            type="button"
            onClick={onAddAccount}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gray-300 text-lg leading-none text-gray-700">
              +
            </span>
            <span className="text-sm font-medium text-gray-800">Добавить аккаунт</span>
          </button>
        </div>
      </div>
    </div>
  );
}
