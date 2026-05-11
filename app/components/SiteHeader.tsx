"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAuthSnapshot, logout as logoutAuth, subscribeAuth, useAuth } from "../lib/auth";
import { isDebugAuthClient } from "../lib/debugAuth";
import { getProfile, subscribeProfiles } from "../lib/profile";
import { getUserById } from "../lib/users";
import { getHeaderGreetingLabel } from "../lib/headerUserLabel";
import { getSiteIdentityLabel } from "../lib/userDisplayName";
import {
  getRememberedAccounts,
  rememberCurrentSession,
  REMEMBERED_ACCOUNTS_CHANGED_EVENT,
  removeRememberedAccount,
  type RememberedAccount,
} from "../lib/rememberedAccounts";
import { AccountCredentialsModal } from "./AccountCredentialsModal";
import { AccountSwitcherModal } from "./AccountSwitcherModal";

/** Temporary account-menu tap debug: `localStorage.setItem("debugAccountMenu","1")` or development build. */
function isAccountMenuDebugOn(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return window.localStorage.getItem("debugAccountMenu") === "1";
  } catch {
    return false;
  }
}

function accountMenuTargetTextSnippet(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "";
  const raw = (target.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.slice(0, 80);
}

function accountMenuLogHrefFromTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const a = target.closest("a[href]");
  const h = a?.getAttribute("href");
  return typeof h === "string" ? h.slice(0, 200) : undefined;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

/**
 * Identical to the former homepage hero `h1` wordmark: same `text-3xl font-extrabold tracking-tight md:text-4xl`
 * and the same `Hal` + `custom-i` spans. Wrapped in `span` + `scale-90` only so it fits the header width.
 * (Hero used `<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Hal<span className="custom-i">i</span>wal<span className="custom-i">i</span></h1>`.)
 */
function HeaderHaliwaliLogo() {
  return (
    <span className="inline-block whitespace-nowrap text-2xl font-extrabold tracking-tight sm:text-3xl md:origin-left md:scale-[0.9] md:text-4xl">
      Hal<span className="custom-i">i</span>wal<span className="custom-i">i</span>
    </span>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const isHome = pathname === "/";
  /** Полноэкранный вход в админку — без меню обычного пользователя и без «Привет, …». */
  const suppressUserChromeForAdmin = pathname === "/admin";

  const [q, setQ] = useState("");
  const auth = useAuth();
  const [userLabel, setUserLabel] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [userVerified, setUserVerified] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Hover-capable pointing device: use hover dropdown; otherwise keep click-open. */
  const [menuUseHover, setMenuUseHover] = useState(false);
  const [menuPanelEntered, setMenuPanelEntered] = useState(false);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccount[]>([]);
  const [credModal, setCredModal] = useState<null | { kind: "add" } | { kind: "switch"; loginLabel: string }>(null);
  const [mounted, setMounted] = useState(false);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const accountMenuId = useId();

  const refreshChatUnread = useCallback(async () => {
    if (!mounted || auth.status !== "ready" || !auth.userId) {
      setChatUnreadTotal(0);
      return;
    }
    try {
      const r = await fetch("/api/chats", { credentials: "include", cache: "no-store" });
      const d = (await r.json()) as { ok?: boolean; unreadTotal?: number };
      if (r.ok && d.ok && typeof d.unreadTotal === "number") setChatUnreadTotal(d.unreadTotal);
      else setChatUnreadTotal(0);
    } catch {
      setChatUnreadTotal(0);
    }
  }, [mounted, auth.status, auth.userId]);

  useEffect(() => {
    // Schedule outside effect body (lint rule).
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    function syncRemembered() {
      setRememberedAccounts(getRememberedAccounts());
    }
    syncRemembered();
    window.addEventListener(REMEMBERED_ACCOUNTS_CHANGED_EVENT, syncRemembered);
    return () => window.removeEventListener(REMEMBERED_ACCOUNTS_CHANGED_EVENT, syncRemembered);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || auth.status !== "ready" || !auth.userId) return;
    const u = getUserById(auth.userId);
    const contact =
      u?.contact?.trim() ||
      getRememberedAccounts().find((a) => a.userId === auth.userId)?.loginLabel?.trim() ||
      (localStorage.getItem("haliwali_account_contact") ?? "").trim();
    if (contact) rememberCurrentSession(auth.userId, contact);
  }, [mounted, auth.status, auth.userId]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    function syncHoverMode() {
      const touchLike =
        (typeof navigator !== "undefined" && Number(navigator.maxTouchPoints) > 0) ||
        (() => {
          try {
            return mqCoarse.matches;
          } catch {
            return false;
          }
        })();
      if (touchLike) {
        setMenuUseHover(false);
        return;
      }
      setMenuUseHover(mq.matches);
    }
    syncHoverMode();
    mq.addEventListener("change", syncHoverMode);
    mqCoarse.addEventListener("change", syncHoverMode);
    return () => {
      mq.removeEventListener("change", syncHoverMode);
      mqCoarse.removeEventListener("change", syncHoverMode);
    };
  }, [mounted]);

  function clearHoverCloseTimer() {
    if (hoverCloseTimerRef.current != null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearHoverCloseTimer();
    };
  }, []);

  function closeAccountMenu() {
    setMenuOpen(false);
    setMenuPanelEntered(false);
  }

  /** Open dropdown with short opacity/slide animation (outside effects to satisfy lint rules). */
  function openAccountMenuAnimated() {
    if (menuUseHover) {
      setMenuPanelEntered(false);
      setMenuOpen(true);
      queueMicrotask(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => setMenuPanelEntered(true));
        });
      });
    } else {
      /* Touch / coarse pointer: show panel immediately so links stay tappable (no pointer-events-none gap). */
      setMenuOpen(true);
      setMenuPanelEntered(true);
    }
  }

  useEffect(() => {
    if (!isAccountMenuDebugOn()) return;
    console.log("[ACCOUNT_MENU_STATE]", { menuOpen, menuPanelEntered, menuUseHover });
  }, [menuOpen, menuPanelEntered, menuUseHover]);

  function syncHeaderProfile() {
    if (typeof window === "undefined") return;
    const snap = getAuthSnapshot();
    if (snap.status !== "ready") return;
    const uid = snap.userId ?? "";
    const profile = uid ? getProfile(uid) : null;
    const user = uid ? getUserById(uid) : null;
    const remembered = getRememberedAccounts();
    const label = uid ? getHeaderGreetingLabel(uid, remembered) : "";
    setUserLabel(label);
    setUserAvatar(profile?.avatarData ?? "");
    setUserVerified(Boolean(user?.phoneVerified));
    if (isDebugAuthClient() && process.env.NODE_ENV !== "production") {
      // Minimal, non-sensitive debug only.
      console.log("[auth] header", { hasUser: Boolean(uid), isAdmin: false });
    }
  }

  useEffect(() => {
    if (!mounted) return;
    queueMicrotask(() => syncHeaderProfile());
  }, [mounted, pathname, auth.status, auth.userId, rememberedAccounts]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const off = subscribeProfiles(() => syncHeaderProfile());
    return off;
  }, [mounted, pathname]);

  useEffect(() => {
    return subscribeAuth(() => {
      if (!mounted) return;
      queueMicrotask(() => syncHeaderProfile());
    });
  }, [mounted]);

  useEffect(() => {
    queueMicrotask(() => void refreshChatUnread());
  }, [refreshChatUnread]);

  useEffect(() => {
    function onChatsUpdated() {
      void refreshChatUnread();
    }
    window.addEventListener("haliwali-chats-updated", onChatsUpdated);
    const id = window.setInterval(() => void refreshChatUnread(), 90000);
    return () => {
      window.removeEventListener("haliwali-chats-updated", onChatsUpdated);
      window.clearInterval(id);
    };
  }, [refreshChatUnread]);

  async function handleLogout(options?: { closeSwitcher?: boolean }) {
    if (typeof window === "undefined") return;
    await logoutAuth();
    setUserLabel("");
    setUserAvatar("");
    setUserVerified(false);
    closeAccountMenu();
    if (options?.closeSwitcher) setAccountSwitcherOpen(false);
    router.push("/");
    router.refresh();
  }

  function openAddAccountModal() {
    closeAccountMenu();
    setAccountSwitcherOpen(false);
    setCredModal({ kind: "add" });
  }

  function handleSelectRememberedAccount(account: RememberedAccount) {
    if (!auth.userId || account.userId === auth.userId) {
      setAccountSwitcherOpen(false);
      return;
    }
    setAccountSwitcherOpen(false);
    setCredModal({ kind: "switch", loginLabel: account.loginLabel });
  }

  function handleRemoveRemembered(userId: string) {
    removeRememberedAccount(userId);
  }

  function afterCredentialLogin() {
    queueMicrotask(() => {
      syncHeaderProfile();
      void refreshChatUnread();
    });
    router.refresh();
  }

  const accountSwitcherCurrentUser = useMemo(() => {
    if (!mounted || typeof window === "undefined") {
      return {
        avatarSrc: userAvatar,
        primaryLabel: "Аккаунт",
        secondaryContact: "—",
      };
    }
    const uid = auth.status === "ready" ? auth.userId ?? "" : "";
    const rememberedList = getRememberedAccounts();
    const primaryRaw = uid ? getHeaderGreetingLabel(uid, rememberedList) : "";
    const primaryLabel = primaryRaw.trim() || "Аккаунт";
    const secondaryContact =
      (uid ? getUserById(uid)?.contact?.trim() : "") ||
      rememberedList.find((a) => a.userId === uid)?.loginLabel?.trim() ||
      "—";
    return {
      avatarSrc: userAvatar,
      primaryLabel,
      secondaryContact,
    };
  }, [mounted, userAvatar, auth.status, auth.userId, rememberedAccounts]);

  useEffect(() => {
    if (!menuOpen && !accountSwitcherOpen) return;
    /** Outside close on `click` (bubble); menu panel/trigger `contains` skips so in-panel `<Link>` navigates first. */
    function onDocClick(e: globalThis.MouseEvent) {
      const t = e.target;
      if (isAccountMenuDebugOn() && t instanceof Node) {
        console.log("[ACCOUNT_MENU_OUTSIDE_CLICK]", {
          insidePanel: Boolean(menuPanelRef.current?.contains(t)),
          insideTrigger: Boolean(menuTriggerRef.current?.contains(t)),
          insideMenuRoot: Boolean(menuRef.current?.contains(t)),
          targetTag: t instanceof Element ? t.tagName : "non-element",
          targetText: t instanceof Element ? accountMenuTargetTextSnippet(t) : "",
        });
      }
      if (!menuOpen) return;
      if (!(t instanceof Node)) return;
      if (menuPanelRef.current?.contains(t)) return;
      if (menuTriggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeAccountMenu();
    }
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        closeAccountMenu();
        setAccountSwitcherOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen, accountSwitcherOpen]);

  useEffect(() => {
    if (isHome) {
      queueMicrotask(() => setQ(sp.get("q") ?? ""));
    } else {
      queueMicrotask(() => setQ(""));
    }
  }, [isHome, sp]);

  const pushSearch = useCallback(
    (raw: string) => {
      const next = new URLSearchParams();
      for (const [k, v] of sp.entries()) {
        if (k === "q") continue;
        next.set(k, v);
      }
      const t = raw.trim();
      if (t) next.set("q", t);
      const qs = next.toString();
      router.push(qs ? `/?${qs}` : "/");
    },
    [router, sp],
  );

  const replaceHomeQ = useCallback(
    (raw: string) => {
      const next = new URLSearchParams();
      for (const [k, v] of sp.entries()) {
        if (k === "q") continue;
        next.set(k, v);
      }
      const t = raw.trim();
      if (t) next.set("q", t);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : "/");
    },
    [router, sp],
  );

  function onInputChange(value: string) {
    setQ(value);
    if (isHome) {
      replaceHomeQ(value);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!isHome) {
      pushSearch(q);
    }
  }

  const postCta = (
    <Link
      href="/post"
      className="inline-flex w-full max-w-full items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 md:w-auto"
    >
      Разместить объявление
    </Link>
  );

  /** Avoid showing «Войти» while auth is syncing or during SSR/hydration. Logged-in users see the menu whenever `userId` is set (includes `loading` re-fetch after `refreshAuthFromServer`). */
  const authHeaderPlaceholder = (
    <span className="inline-block min-h-[36px] min-w-0 shrink-0 sm:min-w-[120px]" aria-hidden />
  );
  const authBlock = suppressUserChromeForAdmin ? null : !mounted ? (
    authHeaderPlaceholder
  ) : auth.userId ? (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={() => {
        if (!menuUseHover) return;
        clearHoverCloseTimer();
        if (menuOpen) return;
        openAccountMenuAnimated();
      }}
      onMouseLeave={() => {
        if (!menuUseHover) return;
        clearHoverCloseTimer();
        hoverCloseTimerRef.current = window.setTimeout(() => {
          closeAccountMenu();
          hoverCloseTimerRef.current = null;
        }, 200);
      }}
    >
      <button
        ref={menuTriggerRef}
        type="button"
        onClick={() => {
          if (menuOpen) closeAccountMenu();
          else openAccountMenuAnimated();
        }}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        aria-controls={`${accountMenuId}-menu`}
        className="cursor-pointer text-left md:whitespace-nowrap"
      >
        <div className="inline-flex min-w-0 max-w-[min(18rem,calc(100vw-13rem))] items-center gap-2 text-sm font-semibold text-gray-800 hover:underline md:max-w-none">
          {userAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatar} alt="" className="h-7 w-7 shrink-0 rounded-full border border-black/10 object-cover" />
          ) : (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-gray-100 text-[11px] text-black/60">
              {(userLabel || "U").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 truncate">{userLabel ? `Привет, ${userLabel}` : "Привет"}</span>
          {userVerified ? (
            <span className="shrink-0" aria-label="Подтверждённый пользователь">
              ✓
            </span>
          ) : null}
          <span className="shrink-0" aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-full z-[80] w-[220px] pt-2">
          <div
            id={`${accountMenuId}-menu`}
            ref={menuPanelRef}
            onPointerDownCapture={(e) => {
              if (!isAccountMenuDebugOn()) return;
              const t = e.target;
              console.log("[ACCOUNT_MENU_PANEL_POINTER_DOWN]", {
                targetTag: t instanceof Element ? t.tagName : typeof t,
                targetText: t instanceof Element ? accountMenuTargetTextSnippet(t) : "",
                href: accountMenuLogHrefFromTarget(t),
                pointerType: e.pointerType,
              });
            }}
            className={[
              "rounded-xl border border-black/10 bg-white p-2 shadow-lg transition-[opacity,transform] duration-150 ease-out",
              /* Open menu must stay hit-testable; opacity/transform only (no pointer-events gating on menuPanelEntered). */
              "pointer-events-auto",
              menuPanelEntered ? "translate-y-0 opacity-100" : "-translate-y-[5px] opacity-0",
            ].join(" ")}
          >
          <Link
            href="/account"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Мои объявления",
                  href: "/account",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Мои объявления
          </Link>
          <Link
            href="/account?tab=favorites"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Избранное",
                  href: "/account?tab=favorites",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Избранное
          </Link>
          <Link
            href="/account?tab=messages"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Сообщения",
                  href: "/account?tab=messages",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            {chatUnreadTotal > 0 ? `Сообщения (${chatUnreadTotal})` : "Сообщения"}
          </Link>
          <Link
            href="/account?tab=profile"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Профиль",
                  href: "/account?tab=profile",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Профиль
          </Link>
          <Link
            href="/support"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Поддержка",
                  href: "/support",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Поддержка
          </Link>
          <Link
            href="/account?tab=settings"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) {
                console.log("[ACCOUNT_MENU_ITEM_CLICK]", {
                  label: "Настройки",
                  href: "/account?tab=settings",
                  defaultPrevented: e.defaultPrevented,
                });
              }
              queueMicrotask(() => closeAccountMenu());
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Настройки
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeAccountMenu();
              setAccountSwitcherOpen(true);
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Переключить аккаунт
          </button>
          <button
            type="button"
            onClick={(e) => {
              if (isAccountMenuDebugOn()) console.log("[ACCOUNT_MENU_LOGOUT_CLICK]");
              e.stopPropagation();
              void handleLogout();
            }}
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
          >
            Выйти
          </button>
          </div>
        </div>
      ) : null}
    </div>
  ) : auth.status === "ready" ? (
    <Link
      href="/login"
      className="block max-w-[min(16rem,calc(100vw-8rem))] text-right text-xs font-semibold leading-tight text-gray-800 break-words [overflow-wrap:anywhere] hover:underline sm:max-w-none sm:text-sm"
    >
      Войти / Регистрация
    </Link>
  ) : (
    authHeaderPlaceholder
  );

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-3 sm:px-6">
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Link href="/" className="inline-flex min-w-0 shrink items-center leading-none">
              <HeaderHaliwaliLogo />
            </Link>
            <div className="min-w-0 shrink">{authBlock}</div>
          </div>
          {suppressUserChromeForAdmin ? null : <div className="w-full min-w-0 max-w-full">{postCta}</div>}
          <div className="relative w-full">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск по объявлениям"
              className="h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-black outline-none placeholder:text-black/40 focus:border-gray-300 focus:ring-2 focus:ring-[rgba(255,122,0,0.2)]"
            />
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-between gap-6 md:flex">
          <Link href="/" className="inline-flex shrink-0 items-center leading-none">
            <HeaderHaliwaliLogo />
          </Link>
          <div className="relative min-w-0 max-w-[500px] flex-1 px-2">
            <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск по объявлениям"
              className="h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-black outline-none placeholder:text-black/40 focus:border-gray-300 focus:ring-2 focus:ring-[rgba(255,122,0,0.2)]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-8">
            {suppressUserChromeForAdmin ? null : postCta}
            {authBlock}
          </div>
        </div>
      </div>
      <AccountSwitcherModal
        isOpen={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
        currentUser={accountSwitcherCurrentUser}
        currentUserId={auth.userId}
        rememberedAccounts={rememberedAccounts}
        onLogout={() =>
          handleLogout({
            closeSwitcher: true,
          })
        }
        onAddAccount={openAddAccountModal}
        onSelectAccount={handleSelectRememberedAccount}
        onRemoveFromList={handleRemoveRemembered}
      />

      <AccountCredentialsModal
        open={credModal != null}
        onClose={() => {
          if (!credModal) return;
          setCredModal(null);
        }}
        title={credModal?.kind === "switch" ? "Вход в аккаунт" : "Добавить аккаунт"}
        subtitle={credModal?.kind === "switch" ? "Для входа в этот аккаунт введите пароль." : null}
        initialLogin={credModal?.kind === "switch" ? credModal.loginLabel : ""}
        onLoggedIn={afterCredentialLogin}
      />
    </header>
  );
}
