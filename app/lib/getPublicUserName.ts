import { getUserDisplayName, USER_DISPLAY_FALLBACK } from "./userDisplayName";

/** Согласовано с {@link getUserDisplayName}: имя/email-префикс → затем только «Без имени». */
export const PUBLIC_DISPLAY_NAME_FALLBACK = USER_DISPLAY_FALLBACK;

/** Shape used by getPublicUserName — полный email наружу не отдаём; для префикса берём только локальную часть. */
export type PublicNameInput = {
  name?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  /** Контакт/логин с `@`, если сохранён не в email. */
  contact?: string | null;
  loginOrEmail?: string | null;
};

export type PublicUserLookupRow = {
  id: string;
  userId: string;
  /** Resolved admin column (optional legacy). Prefer profileName/chosenDisplayName + loginOrEmail. */
  displayName?: string;
  reporterLabel?: string;
  loginOrEmail?: string;
  email?: string;
  profileName?: string;
  chosenDisplayName?: string;
};

export function isPublicDisplayNameFallback(label: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (t === PUBLIC_DISPLAY_NAME_FALLBACK) return true;
  /** В старых данных встречается общий плейсхолдер. */
  if (t === "Пользователь") return true;
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeTechnicalUserId(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (UUID_RE.test(t)) return true;
  if (/^user[_-]?/i.test(t) && t.length <= 40) return true;
  return false;
}

function clampLabel(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > 200 ? t.slice(0, 200) : t;
}

/**
 * Совместимо с историческими вызовами: то же правило отображения, что и {@link getUserDisplayName}.
 */
export function getPublicUserName(user: PublicNameInput | null | undefined): string;
export function getPublicUserName(userId: string, rows: readonly PublicUserLookupRow[] | undefined | null): string;

export function getPublicUserName(
  arg: PublicNameInput | null | undefined | string,
  rows?: readonly PublicUserLookupRow[] | null,
): string {
  if (typeof arg === "string") {
    const id = arg.trim();
    if (!id) return PUBLIC_DISPLAY_NAME_FALLBACK;
    const row = rows?.find((r) => r.id === id || r.userId === id);
    const login = (((row?.loginOrEmail ?? row?.email ?? "") as string).trim()) || "";
    const resolved = getUserDisplayName(
      {
        email: login.includes("@") ? login : undefined,
        loginOrEmail: login.includes("@") ? login : login || undefined,
      },
      {
        name: row?.profileName,
        displayName: row?.chosenDisplayName ?? row?.displayName,
      },
    );
    return clampLabel(resolved);
  }

  if (!arg) return PUBLIC_DISPLAY_NAME_FALLBACK;

  const resolved = getUserDisplayName(
    {
      name: arg.name,
      displayName: arg.displayName,
      fullName: arg.fullName,
      username: arg.username,
      email: arg.email,
      contact: arg.contact,
      loginOrEmail: arg.loginOrEmail,
    },
    undefined,
  );

  return clampLabel(resolved);
}

/** Legacy snapshot on listings/messages (`authorPublicName`): treat as display fallback — never exposes email-derived fields to {@link getPublicUserName}. */
export function snapshotAuthorToPublicInput(storedSnapshot: string | undefined | null): PublicNameInput {
  const s = (storedSnapshot ?? "").trim();
  if (!s) return {};
  if (s.includes("@")) return {};
  return { displayName: s };
}
