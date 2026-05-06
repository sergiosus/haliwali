import { getUserDisplayName, USER_DISPLAY_FALLBACK } from "./userDisplayName";

const STORAGE_KEY = "haliwali_remembered_accounts";

export const REMEMBERED_ACCOUNTS_CHANGED_EVENT = "remembered-accounts-changed";

export type RememberedAccount = {
  id: string;
  userId: string;
  displayName: string;
  loginLabel: string;
  avatarInitials?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  lastUsedAt?: string;
};

function normalizeAccount(raw: unknown): RememberedAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = String(o.userId ?? o.id ?? "").trim();
  if (!userId) return null;
  const loginLabel = String(o.loginLabel ?? o.email ?? o.phone ?? "").trim();
  const resolved = getUserDisplayName(
    {
      name: typeof o.name === "string" ? o.name : undefined,
      displayName: typeof o.displayName === "string" ? o.displayName : undefined,
      email: typeof o.email === "string" ? o.email : undefined,
      loginOrEmail: loginLabel.includes("@") ? loginLabel : undefined,
    },
    undefined,
  );
  const displayName = resolved === USER_DISPLAY_FALLBACK ? (loginLabel || resolved) : resolved;
  return {
    id: userId,
    userId,
    loginLabel,
    displayName,
    avatarInitials: typeof o.avatarInitials === "string" ? o.avatarInitials : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    email: typeof o.email === "string" ? o.email : undefined,
    phone: typeof o.phone === "string" ? o.phone : undefined,
    avatar: typeof o.avatar === "string" ? o.avatar : undefined,
    lastUsedAt: typeof o.lastUsedAt === "string" ? o.lastUsedAt : undefined,
  };
}

export function getRememberedAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RememberedAccount[] = [];
    for (const item of parsed) {
      const n = normalizeAccount(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

/** Upserts the account used for the current session (email/phone/login label). Max 5 entries. */
export function rememberCurrentSession(userId: string, loginContact: string) {
  if (typeof window === "undefined" || !(userId ?? "").trim()) return;
  const uid = userId.trim();
  const contact = (loginContact ?? "").trim();
  const rn = getUserDisplayName(
    { email: contact.includes("@") ? contact : undefined },
    undefined,
  );
  const displayName = rn === USER_DISPLAY_FALLBACK ? contact || rn : rn;
  const account: RememberedAccount = {
    id: uid,
    userId: uid,
    loginLabel: contact || displayName,
    displayName,
    lastUsedAt: new Date().toISOString(),
  };
  const list = getRememberedAccounts();
  const next = [account, ...list.filter((item) => item.userId !== uid)].slice(0, 5);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(REMEMBERED_ACCOUNTS_CHANGED_EVENT));
}

export function removeRememberedAccount(id: string) {
  if (typeof window === "undefined") return;
  const uid = (id ?? "").trim();
  if (!uid) return;
  const next = getRememberedAccounts().filter((item) => item.userId !== uid);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(REMEMBERED_ACCOUNTS_CHANGED_EVENT));
}
