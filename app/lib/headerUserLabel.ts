"use client";

import type { RememberedAccount } from "./rememberedAccounts";
import { getUserById } from "./users";
import { getSiteIdentityLabel, USER_DISPLAY_FALLBACK } from "./userDisplayName";

function emailLocalPart(contact: string): string {
  const c = contact.trim();
  if (!c.includes("@")) return "";
  return c.split("@")[0]?.trim() ?? "";
}

/**
 * Подпись «Привет, …» только для текущего userId из кэша аккаунта (`/auth/me`).
 * Никогда не берёт локальный черновик профиля (`getProfile`): только зеркало сервера на `users` + резерв remembered.
 * Порядок: полное имя → локальная часть email → никнейм сервера.
 */
export function getHeaderGreetingLabel(userId: string, rememberedAccounts: readonly RememberedAccount[]): string {
  const uid = (userId ?? "").trim();
  if (!uid) return "";

  const user = getUserById(uid);

  if (user) {
    const fromAuthMirror = getSiteIdentityLabel({
      name: `${user.serverProfileName ?? ""}`.trim(),
      displayName: `${user.serverChosenDisplay ?? ""}`.trim(),
      email: user.email?.trim().includes("@") ? user.email : undefined,
      contact: `${user.contact ?? ""}`.trim().includes("@") ? user.contact.trim() : undefined,
    });

    if (fromAuthMirror !== USER_DISPLAY_FALLBACK && fromAuthMirror.trim()) return fromAuthMirror.trim();
  }

  const remembered = rememberedAccounts.find((a) => a.userId === uid) ?? null;

  const cachedContact = user?.contact?.trim() || "";
  if (cachedContact) {
    const lp = emailLocalPart(cachedContact);
    if (lp) return lp;
    return cachedContact.length > 32 ? cachedContact.slice(0, 32) : cachedContact;
  }

  if (remembered?.name?.trim()) return remembered.name.trim();

  const remLogin = remembered?.loginLabel?.trim() || "";
  const remEmail = remembered?.email?.trim() || "";
  for (const c of [remLogin, remEmail]) {
    const lp = emailLocalPart(c);
    if (lp) return lp;
  }

  const remPhone = remembered?.phone?.trim() || "";
  if (remPhone) return remPhone.length > 32 ? remPhone.slice(0, 32) : remPhone;

  return "";
}
