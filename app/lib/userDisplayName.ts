/**
 * Единая подпись пользователя для UI.
 *
 * {@link getSiteIdentityLabel} — приоритет для «чьё это я»: полное имя → локальная часть email
 * → ник (displayName). Так пустое поле имени не подменяется ником поверх email.
 *
 * Legacy {@link getUserDisplayName}(user, profile?, options?) — склеивает черновик профиля (`profile.name`)
 * с данными аккаунта; ник на сервере не опережает email, если имени нет.
 */

export const USER_DISPLAY_FALLBACK = "Без имени";

export type UserDisplaySource = {
  id?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  contact?: string | null;
  loginOrEmail?: string | null;
  username?: string | null;
};

export type GetUserDisplayNameOptions = {
  /**
   * When `false`, never derive from email/contact/login local-part — only saved names/usernames apply.
   * Use where email must not be synthesized into a display string.
   */
  allowEmailFallback?: boolean;
};

/**
 * Одна строка подписи: имя/fullName → локальная часть email/contact → ник/displayName/username.
 */
export function getSiteIdentityLabel(
  src: UserDisplaySource | null | undefined,
  options?: Pick<GetUserDisplayNameOptions, "allowEmailFallback">,
): string {
  const allowEmail = options?.allowEmailFallback !== false;

  const primary =
    `${src?.name ?? ""}`.trim() ||
    `${src?.fullName ?? ""}`.trim();

  if (primary) return primary;

  const tryLocalFrom = (raw: string): string => {
    const t = raw.trim();
    if (!t.includes("@")) return "";
    return `${t.split("@")[0] ?? ""}`.trim();
  };

  if (allowEmail) {
    const fromEmail = tryLocalFrom(`${src?.email ?? ""}`);
    if (fromEmail) return fromEmail;

    const fromContact =
      tryLocalFrom(`${src?.contact ?? ""}`) ||
      tryLocalFrom(`${src?.loginOrEmail ?? ""}`);
    if (fromContact) return fromContact;

    const dn = `${src?.displayName ?? ""}`.trim();
    if (dn) return dn;

    const un = `${src?.username ?? ""}`.trim();
    if (un) return un;
  } else {
    const dn = `${src?.displayName ?? ""}`.trim();
    if (dn) return dn;
    const un = `${src?.username ?? ""}`.trim();
    if (un) return un;
  }

  return USER_DISPLAY_FALLBACK;
}

/** Склейка «серверного» user и необязательного черновика `profile.name` (только поле имени черновика). */
export function getUserDisplayName(user: UserDisplaySource | null | undefined): string;
export function getUserDisplayName(user: any, profile?: any, options?: GetUserDisplayNameOptions): string;
export function getUserDisplayName(user: any, profile?: any, options?: GetUserDisplayNameOptions): string {
  if (arguments.length === 1) {
    return getSiteIdentityLabel(user as UserDisplaySource);
  }

  const allowEmail = options?.allowEmailFallback !== false;

  const primaryName =
    `${profile?.name ?? ""}`.trim() ||
    `${user?.name ?? ""}`.trim() ||
    `${profile?.fullName ?? ""}`.trim() ||
    `${user?.fullName ?? ""}`.trim();

  const merged: UserDisplaySource = {
    ...(primaryName ? { name: primaryName } : {}),
    ...(typeof user?.displayName === "string" && `${user.displayName}`.trim() ?
      { displayName: `${user.displayName}`.trim() }
    : {}),
    ...(typeof user?.email === "string" ? { email: user.email } : {}),
    ...(typeof user?.contact === "string" ? { contact: user.contact } : {}),
    ...(typeof user?.loginOrEmail === "string" ? { loginOrEmail: user.loginOrEmail } : {}),
    ...(typeof user?.username === "string" ? { username: user.username } : {}),
  };

  return getSiteIdentityLabel(merged, { allowEmailFallback: allowEmail });
}
