"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackNavButton } from "../components/BackNavButton";
import { PasswordChangeModal } from "../components/PasswordChangeModal";
import type { Listing, ListingStatus } from "../lib/listings";
import { isListingPubliclyListed, isPublicStatus, normalizeListingLifecycle, useListingsStore } from "../lib/listings";
import { listingPath } from "../lib/seo";
import { applyAuthFromMeResponse, invalidateAuthMeDedupeCache, loadAuthMeFromServer, useAuth } from "../lib/auth";
import { isDebugAuthClient } from "../lib/debugAuth";
import { getFavorites, subscribeFavorites, toggleFavorite } from "../lib/favorites";
import { getProfile, removeProfile, saveProfile, type UserProfile } from "../lib/profile";
import { getUserById, syncProfilePhoneFromAccount } from "../lib/users";
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from "../lib/identity";
import { isPublicDisplayNameFallback, PUBLIC_DISPLAY_NAME_FALLBACK } from "../lib/getPublicUserName";
import { getSiteIdentityLabel, USER_DISPLAY_FALLBACK } from "../lib/userDisplayName";
import { formatListingCardAuthor } from "../lib/listingCardAuthorDisplay";
import { normalizeListingId } from "../lib/listingId";
import { appendReturnUrlQuery } from "../lib/returnNavigation";

/** Центрированная колонка для сетки объявлений (max ~900px, на узких экранах — с боковым отступом). */
const listingCardsContainerClass =
  "listing-cards-grid-container mx-auto w-full max-w-[900px] max-[768px]:max-w-none max-[768px]:px-3";
/** Сетка: минимальная колонка ~380px (раньше 320px «задушило» нижний ряд кнопок). */
const listingGridClass =
  "listing-cards-grid grid w-full justify-items-stretch gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr))]";
const favoritesListingGridClass =
  "listing-cards-grid grid w-full justify-items-stretch gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,372px),1fr))]";
/** Карточка: колонка, mt-auto прижимает действия к низу. */
const compactCardClass =
  "listing-card flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden rounded-[12px] border border-black/10 bg-white p-5";
/** Нижний ряд кнопок: wrap на десктопе, полная ширина колонкой на мобильном. */
const compactActionsRowClass =
  "listing-card-actions actions-row flex w-full shrink-0 flex-wrap gap-[12px] max-[768px]:flex-col max-[768px]:gap-3";
/** Обёртка «мета + действия» у низа карточки. */
const listingCardBottomSectionClass =
  "mt-auto flex flex-col gap-3 border-t border-black/[0.06] pt-4 max-md:gap-2.5";
/** Базовый стиль кнопки в actions-row */
const compactActionsRowBtnBase =
  "inline-flex h-10 min-h-10 min-w-[120px] flex-none items-center justify-center whitespace-nowrap rounded-[10px] border px-3 text-sm font-semibold leading-none max-[768px]:min-h-11 max-[768px]:w-full max-[768px]:min-w-0";
const compactActionsRowBtnSecondary =
  `${compactActionsRowBtnBase} border-black/15 bg-white text-black hover:bg-black/5 disabled:pointer-events-none disabled:opacity-45`;
const compactActionsRowBtnPrimary =
  `${compactActionsRowBtnBase} border-transparent bg-orange-500 text-white hover:bg-orange-600`;
const compactActionsRowBtnDanger =
  `${compactActionsRowBtnSecondary} border-red-200 text-red-700 hover:bg-red-50`;

/** Избранное: чуть плотнее по вертикали, отступы как у карточек «Мои» (20px). */
const favoritesCardClass =
  "listing-card flex h-full min-h-0 w-full flex-col gap-2.5 overflow-hidden rounded-[12px] border border-black/10 bg-white p-5";
const favoritesBottomSectionClass =
  "mt-auto flex flex-col gap-2 border-t border-black/[0.06] pt-3 max-md:gap-2";

type StatusTab = "all" | "pending" | "published" | "rejected" | "trash" | "archive";
type MainTab = "ads" | "favorites" | "profile" | "messages" | "settings";

type ChatConversationSummary = {
  conversationId: string;
  listingId: string;
  listingTitle: string;
  otherUserId: string;
  /** Resolved on server from verified user profile (safe email prefix pattern). */
  participantPublicName: string;
  lastMessageSenderLabel: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
};

function optionalListingAuthorNameField(listing: Listing): string | undefined {
  const apn = (listing.authorPublicName ?? "").trim();
  if (apn) return apn;
  const v = (listing as unknown as { authorName?: unknown }).authorName;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

/** Имя для строки меты карточки: live `/public` → клиент/сервер профиль → снимок в объявлении. */
function accountListingCardAuthorDisplay(
  ownerId: string | undefined | null,
  apiIdentityByUserId: Readonly<Record<string, string>>,
  listing?: Listing,
): string {
  const id = (ownerId ?? "").trim();
  const apiIdentity = id ? apiIdentityByUserId[id]?.trim() ?? "" : "";
  return formatListingCardAuthor({
    ownerId: id || undefined,
    publicApi: apiIdentity ? { identityLabel: apiIdentity } : null,
    storedAuthorName: listing ? optionalListingAuthorNameField(listing) : undefined,
    ...(listing ? { debugListingMeta: { id: listing.id, ownerId: listing.ownerId, authorPublicName: listing.authorPublicName } } : {}),
  });
}

function resolveMessagesPeerLabel(userId: string, apiLabels: Readonly<Record<string, string>>): string {
  return accountListingCardAuthorDisplay(userId, apiLabels);
}

function messagesPeerCardLabel(
  row: ChatConversationSummary,
  apiLabels: Readonly<Record<string, string>>,
  listInitiallyLoading: boolean,
): string {
  const srv = row.participantPublicName.trim();
  if (srv === "Удалённый пользователь") return srv;
  if (srv && !isPublicDisplayNameFallback(srv)) return srv;

  const fromClient = resolveMessagesPeerLabel(row.otherUserId, apiLabels);
  if (!isPublicDisplayNameFallback(fromClient)) return fromClient;

  if (listInitiallyLoading && !srv) return "Загрузка…";
  return srv || PUBLIC_DISPLAY_NAME_FALLBACK;
}

function statusLabel(status: ListingStatus) {
  if (status === "pending") return "На проверке";
  if (status === "rejected") return "Отклонено";
  return "Опубликовано";
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Одна строка меты под бейджами: дата · автор · просмотры [· цена]. */
function ListingCardInlineMetaRow({
  createdAt,
  authorLabel,
  views,
  priceRub,
}: {
  createdAt: number;
  authorLabel: string;
  views: number;
  priceRub?: number;
}) {
  return (
    <div className="line-clamp-1 min-w-0 text-[11px] text-black/55">
      <span>{formatDate(createdAt)}</span>
      <span aria-hidden className="text-black/35">
        {" "}
        ·{" "}
      </span>
      <span>
        Автор: <span className="font-medium text-black/78">{authorLabel}</span>
      </span>
      <span aria-hidden className="text-black/35">
        {" "}
        ·{" "}
      </span>
      <span>
        Просмотры: <span className="font-medium text-black/75">{views}</span>
      </span>
      {typeof priceRub === "number" ? (
        <>
          <span aria-hidden className="text-black/35">
            {" "}
            ·{" "}
          </span>
          <span className="font-medium text-black/75">{Intl.NumberFormat("ru-RU").format(priceRub)} ₽</span>
        </>
      ) : null}
    </div>
  );
}

function ListingCardCover({ photos, compact }: { photos?: string[] | null; compact?: boolean }) {
  const src = photos?.map((x) => String(x ?? "").trim()).find(Boolean) ?? "";
  const box = compact ? "h-[118px] min-h-[100px]" : "h-[148px]";
  const placeholderMin = compact ? "min-h-[100px]" : "min-h-[132px]";
  return (
    <div
      className={[
        "relative w-full shrink-0 overflow-hidden rounded-[11px] bg-black/[0.035]",
        box,
      ].join(" ")}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className={[
            "flex h-full w-full items-center justify-center px-3 text-xs font-medium text-black/40",
            placeholderMin,
          ].join(" ")}
        >
          Нет фото
        </div>
      )}
    </div>
  );
}

type MeResponse =
  | {
      ok: true;
      user: {
        userId: string;
        createdAt: number;
        email: string;
        phone: string;
        phoneVisible: boolean;
        deletionStatus: "" | "pending_deletion" | "deleted";
        deleteRequestedAt: number | null;
        deleteScheduledAt: number | null;
        /** Persisted full profile name (`StoredUser.name` / `full_name`). */
        name: string;
        displayName: string;
      };
    }
  | { ok: false };

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-black/[0.03] text-black" />}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    if (initialTab === "favorites") return "favorites";
    if (initialTab === "profile") return "profile";
    if (initialTab === "messages") return "messages";
    if (initialTab === "settings") return "settings";
    return "ads";
  });
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const { loaded, listings, deleteListing, updateListing, archiveListingFromTrash, permanentDeleteListingFromTrash } =
    useListingsStore();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    phone: "",
    city: "",
    about: "",
    avatarData: "",
    preferredContact: "messages",
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<string>("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  /** Phone last written by «Сохранить профиль» — drives verification banner (not draft edits). */
  const [persistedPhone, setPersistedPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeOpen, setPhoneCodeOpen] = useState(false);
  const [phoneResendSeconds, setPhoneResendSeconds] = useState(0);
  const [phoneStatusMessage, setPhoneStatusMessage] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  type AccountDeletePhase = null | "menu" | "confirmImmediate" | "confirmDelayed";
  const [accountDeletePhase, setAccountDeletePhase] = useState<AccountDeletePhase>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteActionError, setDeleteActionError] = useState<string | null>(null);
  const [chatRows, setChatRows] = useState<ChatConversationSummary[]>([]);
  const [chatsUnreadTotal, setChatsUnreadTotal] = useState(0);
  const [chatsLoading, setChatsLoading] = useState(false);
  /** `identityLabel` из GET /api/users/.../public (имя → email-префикс → ник). */
  const [peerPublicLabels, setPeerPublicLabels] = useState<Record<string, string>>({});
  const peerPublicFetchDoneRef = useRef<Set<string>>(new Set());
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  const refreshMe = useCallback(async (opts?: { bypassCache?: boolean }) => {
    try {
      const { status, data } = await loadAuthMeFromServer({ bypassCache: opts?.bypassCache });
      const parsed = data as MeResponse;
      applyAuthFromMeResponse(status, parsed);
      if (status === 200 && parsed.ok) {
        setMe(parsed);
      } else {
        setMe({ ok: false });
      }
    } catch {
      applyAuthFromMeResponse(401, { ok: false });
      setMe({ ok: false });
    }
  }, []);

  const refreshChats = useCallback(async () => {
    if (auth.status !== "ready" || !auth.userId) {
      setChatRows([]);
      setChatsUnreadTotal(0);
      return;
    }
    setChatsLoading(true);
    try {
      const r = await fetch("/api/chats", { credentials: "include", cache: "no-store" });
      const d = (await r.json()) as {
        ok?: boolean;
        unreadTotal?: number;
        conversations?: Array<Record<string, unknown>>;
      };
      if (!r.ok || !d.ok || !Array.isArray(d.conversations)) {
        setChatRows([]);
        setChatsUnreadTotal(typeof d.unreadTotal === "number" ? d.unreadTotal : 0);
        return;
      }
      setChatsUnreadTotal(typeof d.unreadTotal === "number" ? d.unreadTotal : 0);
      const rows: ChatConversationSummary[] = d.conversations
        .map((raw) => ({
          conversationId: String(raw.conversationId ?? ""),
          listingId: String(raw.listingId ?? ""),
          listingTitle: String(raw.listingTitle ?? "Объявление"),
          otherUserId: String(raw.otherUserId ?? ""),
          participantPublicName: String(raw.participantPublicName ?? "").trim(),
          lastMessageSenderLabel: String(raw.lastMessageSenderLabel ?? "").trim(),
          lastMessageText: String(raw.lastMessageText ?? ""),
          lastMessageAt: typeof raw.lastMessageAt === "number" ? raw.lastMessageAt : 0,
          unreadCount: typeof raw.unreadCount === "number" ? raw.unreadCount : 0,
        }))
        .filter((x) => x.conversationId && x.listingId && x.otherUserId);
      setChatRows(rows);
    } catch {
      setChatRows([]);
      setChatsUnreadTotal(0);
    } finally {
      setChatsLoading(false);
    }
  }, [auth.status, auth.userId]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "favorites") setMainTab("favorites");
    else if (t === "profile") setMainTab("profile");
    else if (t === "messages") setMainTab("messages");
    else if (t === "settings") setMainTab("settings");
  }, [searchParams]);

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) {
      setChatRows([]);
      setChatsUnreadTotal(0);
      return;
    }
    void refreshChats();
    function onChatsUpdated() {
      void refreshChats();
    }
    window.addEventListener("haliwali-chats-updated", onChatsUpdated);
    const id = window.setInterval(() => void refreshChats(), 60000);
    return () => {
      window.removeEventListener("haliwali-chats-updated", onChatsUpdated);
      window.clearInterval(id);
    };
  }, [auth.status, auth.userId, refreshChats]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshMe();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshMe]);

  async function executeDeletion(kind: "immediate" | "delayed") {
    const uidForImmediate = auth.userId ?? (me?.ok ? me.user.userId : "");
    setDeleteBusy(true);
    setDeleteActionError(null);
    try {
      const r = await fetch("/api/account/delete-request", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: kind === "immediate" ? "immediate" : "delayed" }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (!r.ok || !data.ok) {
        setDeleteActionError("Не удалось выполнить запрос. Попробуйте позже.");
        return;
      }
      setAccountDeletePhase(null);
      if (kind === "immediate") {
        const uid = uidForImmediate;
        if (uid) removeProfile(uid);
        if (typeof window !== "undefined") {
          localStorage.removeItem("haliwali_user_id");
          localStorage.removeItem("haliwali_account_contact");
          window.location.href = "/";
        }
        return;
      }
      await refreshMe({ bypassCache: true });
    } catch {
      setDeleteActionError("Не удалось выполнить запрос. Попробуйте позже.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function restoreAccount() {
    setDeleteBusy(true);
    setDeleteActionError(null);
    try {
      const r = await fetch("/api/account/restore", { method: "POST", credentials: "include", cache: "no-store" });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (!r.ok || !data.ok) {
        setDeleteActionError("Не удалось восстановить аккаунт.");
        return;
      }
      await refreshMe({ bypassCache: true });
    } catch {
      setDeleteActionError("Не удалось восстановить аккаунт.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const showVerifyBanner =
    persistedPhone.trim() !== "" && !phoneVerified && normalizePhone(persistedPhone) !== "";

  async function sendPersistedPhoneCode() {
    setPhoneStatusMessage(null);
    const normalized = normalizePhone(persistedPhone);
    if (!normalized || !isValidPhone(normalized)) {
      setPhoneStatusMessage(PHONE_VALIDATION_MESSAGE);
      return;
    }
    const r = await fetch("/api/profile/phone/request-code", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalized }),
    });
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setPhoneStatusMessage(data.error ?? "Не удалось отправить код");
      return;
    }
    setPhoneCodeOpen(true);
    setPhoneResendSeconds(60);
    setPhoneStatusMessage("Код отправлен");
  }

  async function verifyPersistedPhoneCode() {
    setPhoneStatusMessage(null);
    const normalized = normalizePhone(persistedPhone);
    const r = await fetch("/api/profile/phone/verify-code", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalized, code: phoneCode.trim() }),
    });
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setPhoneStatusMessage(data.error ?? "Неверный код");
      return;
    }
    setPhoneVerified(true);
    setPhoneCodeOpen(false);
    setPhoneCode("");
    setPhoneStatusMessage("Подтверждение успешно");
  }

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) return;
    const uid = auth.userId;
    return subscribeFavorites(() => setFavoriteIds(getFavorites(uid)));
  }, [auth.status, auth.userId]);

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) return;
    const uid = auth.userId;
    const p = getProfile(uid);
    const serverNm = me && me.ok && typeof me.user.name === "string" ? me.user.name : p.name;
    setProfile({ ...p, name: serverNm });
    setAvatarDraft(p.avatarData ?? "");
    setPersistedPhone((p.phone ?? "").trim());
    setFavoriteIds(getFavorites(uid));
  }, [auth.status, auth.userId, me]);

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) {
      setPhoneVerified(false);
      return;
    }
    setPhoneVerified(Boolean(getUserById(auth.userId)?.phoneVerified));
  }, [auth.status, auth.userId, me]);

  useEffect(() => {
    if (!isDebugAuthClient()) return;
    if (auth.status !== "ready") return;
    const uid = (auth.userId ?? "").trim();
    console.log("[auth] profile", {
      hasUser: Boolean(uid),
      userIdLen: uid.length,
      userIdPrefix: uid.length > 10 ? `${uid.slice(0, 6)}…` : uid || undefined,
    });
  }, [auth.status, auth.userId]);

  const allMine = useMemo(() => {
    const userId = auth.status === "ready" ? auth.userId : null;
    if (!userId) return [];
    return listings.filter((l) => (l.ownerId ?? "").trim() === userId);
  }, [listings, auth.status, auth.userId]);

  const mineLive = useMemo(
    () => allMine.filter((l) => normalizeListingLifecycle(l.listingLifecycle) === "live"),
    [allMine],
  );
  const mineTrash = useMemo(
    () => allMine.filter((l) => normalizeListingLifecycle(l.listingLifecycle) === "deleted"),
    [allMine],
  );
  const mineArchive = useMemo(
    () => allMine.filter((l) => normalizeListingLifecycle(l.listingLifecycle) === "archived"),
    [allMine],
  );

  const pending = useMemo(() => mineLive.filter((l) => l.status === "pending"), [mineLive]);
  const published = useMemo(() => mineLive.filter((l) => isPublicStatus(l.status)), [mineLive]);
  const rejected = useMemo(() => mineLive.filter((l) => l.status === "rejected"), [mineLive]);

  const shown =
    statusTab === "pending"
      ? pending
      : statusTab === "published"
        ? published
        : statusTab === "rejected"
          ? rejected
          : statusTab === "trash"
            ? mineTrash
            : statusTab === "archive"
              ? mineArchive
              : mineLive;

  const favoriteListings = useMemo(() => {
    const idSet = new Set(favoriteIds);
    return listings.filter((l) => idSet.has(l.id) && isListingPubliclyListed(l));
  }, [favoriteIds, listings]);

  useEffect(() => {
    const idsMine = shown.map((l) => l.id).filter(Boolean);
    const idsFav = favoriteListings.map((l) => l.id).filter(Boolean);
    const ids = [...new Set([...idsMine, ...idsFav])];
    if (ids.length === 0) return;
    let cancelled = false;
    const qs = ids.map((id) => encodeURIComponent(id)).join(",");
    void fetch(`/api/listings/views?ids=${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const counts = (d as { counts?: unknown }).counts;
        if (!counts || typeof counts !== "object") return;
        setViewCounts(counts as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shown, favoriteListings]);

  const peerUserIdsToHydrate = useMemo(() => {
    const s = new Set<string>();
    for (const l of allMine) {
      const o = (l.ownerId ?? "").trim();
      if (o) s.add(o);
    }
    for (const l of favoriteListings) {
      const o = (l.ownerId ?? "").trim();
      if (o) s.add(o);
    }
    for (const c of chatRows) {
      const o = (c.otherUserId ?? "").trim();
      if (o) s.add(o);
    }
    return [...s].filter((id) => id.startsWith("user-")).sort();
  }, [allMine, favoriteListings, chatRows]);

  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) {
      setPeerPublicLabels({});
      peerPublicFetchDoneRef.current = new Set();
      return;
    }
    let cancelled = false;
    for (const userId of peerUserIdsToHydrate) {
      if (peerPublicFetchDoneRef.current.has(userId)) continue;
      peerPublicFetchDoneRef.current.add(userId);
      void fetch(`/api/users/${encodeURIComponent(userId)}/public`, {
        credentials: "include",
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d || typeof d !== "object") {
            peerPublicFetchDoneRef.current.delete(userId);
            return;
          }
          const identityLabel =
            typeof (d as { identityLabel?: unknown }).identityLabel === "string" ?
              `${(d as { identityLabel: string }).identityLabel}`.trim()
            : typeof (d as { name?: unknown }).name === "string" ?
              `${(d as { name: string }).name}`.trim()
            : "";
          setPeerPublicLabels((p) =>
            p[userId] === identityLabel ? p : { ...p, [userId]: identityLabel },
          );
        })
        .catch(() => {
          peerPublicFetchDoneRef.current.delete(userId);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.userId, peerUserIdsToHydrate]);

  const registeredAt = useMemo(() => (me && me.ok ? me.user.createdAt : null), [me]);
  const accountContactDisplay = useMemo(() => {
    if (me?.ok) {
      const e = me.user.email?.trim();
      const p = me.user.phone?.trim();
      if (e) return e;
      if (p) return p;
    }
    return "не указан";
  }, [me]);
  const profileFallbackLabel = useMemo(() => {
    const fromMe =
      me?.ok && me.user.email?.trim() ? (me.user.email.split("@")[0] ?? "").trim() : "";
    const serverNm = me?.ok ? (me.user.name ?? "").trim() : "";
    const source = profile.name.trim() || serverNm || fromMe || "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }, [profile.name, me]);

  /** Только аккаунт с сервера (`/auth/me`), без локального черновика input — см. задачу идентичности. */
  const cabinetPublicName = useMemo(() => {
    if (auth.status !== "ready" || !auth.userId || !me?.ok) return "";
    const label = getSiteIdentityLabel({
      name: (me.user.name ?? "").trim(),
      displayName: (me.user.displayName ?? "").trim(),
      email: (me.user.email ?? "").trim(),
    });
    if (label === USER_DISPLAY_FALLBACK) return "";
    return label;
  }, [auth.status, auth.userId, me]);

  useEffect(() => {
    if (!isDebugAuthClient() || !me?.ok) return;
    const uid = (me.user.userId ?? "").trim();
    const label = getSiteIdentityLabel({
      name: me.user.name,
      displayName: me.user.displayName,
      email: me.user.email,
    });
    console.log("[account] me.summary", {
      userIdPrefix: uid.length > 10 ? `${uid.slice(0, 6)}…` : uid || undefined,
      hasEmail: Boolean(me.user.email?.trim()),
      hasPhone: Boolean(me.user.phone?.trim()),
      hasName: Boolean(me.user.name?.trim()),
      hasDisplayName: Boolean(me.user.displayName?.trim()),
      labelLen: label.length,
    });
  }, [me]);

  useEffect(() => {
    if (!cropOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setCropOpen(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [cropOpen]);
  useEffect(() => {
    if (phoneResendSeconds <= 0) return;
    const id = window.setInterval(() => setPhoneResendSeconds((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [phoneResendSeconds]);

  async function onAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type) || f.size > 5 * 1024 * 1024) {
      setAvatarError("Можно загрузить JPG, PNG или WebP до 5 МБ.");
      e.target.value = "";
      return;
    }
    setAvatarError(null);
    const data = await fileToDataUrl(f);
    setAvatarDraft(data);
    setCropZoom(1);
    setCropX(0);
    setCropY(0);
    setCropOpen(true);
    e.target.value = "";
  }

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[1000px] px-4 sm:px-6">
        <header className="flex items-center justify-between py-3">
          <BackNavButton home className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="pb-12">
          <div className="rounded-3xl border border-black/10 bg-white px-4 pb-4 pt-3 sm:px-5">
            {auth.status !== "ready" ? (
              <div className="text-sm text-black/60">Загрузка…</div>
            ) : !auth.userId ? (
              <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70">
                <div className="font-semibold text-black/80">Вы ещё не вошли в кабинет</div>
                <div className="mt-1 text-sm text-black/60">Для будущего восстановления объявлений укажите email или телефон.</div>
                <div className="mt-3">
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
                    style={{ backgroundColor: "#ff7a00" }}
                  >
                    Войти
                  </Link>
                </div>
              </div>
            ) : (
              <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-[17px] font-semibold leading-snug tracking-tight sm:text-lg">
                  Личный кабинет{cabinetPublicName ? `: ${cabinetPublicName}` : ""}
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabButton label="Мои объявления" active={mainTab === "ads"} onClick={() => setMainTab("ads")} />
              <TabButton label="Избранное" active={mainTab === "favorites"} onClick={() => setMainTab("favorites")} />
              <TabButton
                label={chatsUnreadTotal > 0 ? `Сообщения (${chatsUnreadTotal})` : "Сообщения"}
                active={mainTab === "messages"}
                onClick={() => setMainTab("messages")}
              />
              <TabButton label="Профиль" active={mainTab === "profile"} onClick={() => setMainTab("profile")} />
              <TabButton label="Настройки" active={mainTab === "settings"} onClick={() => setMainTab("settings")} />
              <Link
                href="/support"
                className="inline-flex h-[32px] max-w-full shrink-0 items-center rounded-[13px] border border-black/10 bg-white px-3 text-[13px] font-semibold leading-none text-black/70 transition-colors hover:bg-black/5"
              >
                Поддержка
              </Link>
            </div>

            <div className="mt-3">
              {!loaded ? (
                <div className="text-sm text-black/60">Загрузка…</div>
              ) : mainTab === "profile" ? (
                <div className="rounded-2xl border border-black/10 bg-white p-3 sm:p-4">
                  <div className="text-[17px] font-semibold text-black/90">Профиль</div>
                  <div className="mt-0.5 text-[13px] text-black/60">
                    Эти данные необязательны, но помогут другим пользователям быстрее связаться с вами.
                  </div>
                  <div className="mt-4 flex flex-wrap items-start gap-4 rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={onAvatarFileChange}
                    />
                    <button
                      type="button"
                      aria-label="Загрузить фото"
                      title="Загрузить фото"
                      onClick={() => fileRef.current?.click()}
                      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-black/10 bg-gray-100 ring-offset-2 outline-none transition hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-[rgba(255,122,0,0.45)]"
                    >
                      {avatarDraft ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarDraft} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-black/55">
                          {profileFallbackLabel}
                        </div>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
                        >
                          Загрузить фото
                        </button>
                        {avatarDraft ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarDraft("");
                              setProfile((p) => ({ ...p, avatarData: "" }));
                              setAvatarError(null);
                            }}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
                          >
                            Удалить фото
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 max-w-xl text-xs text-black/55">
                        Фото необязательно. Оно поможет другим пользователям быстрее узнать вас.
                      </div>
                      {avatarError ? <div className="mt-2 text-sm text-red-700">{avatarError}</div> : null}
                    </div>
                  </div>
                  {showVerifyBanner ? (
                    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                      <div className="text-sm font-semibold text-orange-900">Подтвердите телефон</div>
                      <div className="mt-1 text-sm text-orange-800/90">
                        Подтвердите номер, чтобы повысить доверие к вашему профилю
                      </div>
                      {!phoneCodeOpen ? (
                        <button
                          type="button"
                          onClick={() => void sendPersistedPhoneCode()}
                          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-orange-300 bg-white px-3 text-xs font-semibold text-orange-800 hover:bg-orange-100/40"
                        >
                          Подтвердить
                        </button>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          <input
                            value={phoneCode}
                            onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="Код из SMS"
                            className={inputClass}
                          />
                          <div className="text-xs text-black/55">
                            {phoneResendSeconds > 0
                              ? `Отправить код повторно через ${phoneResendSeconds} сек`
                              : "Можно отправить код повторно"}
                          </div>
                          <button
                            type="button"
                            onClick={() => void verifyPersistedPhoneCode()}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-black/15 bg-white px-3 text-xs font-semibold text-black/80 hover:bg-black/[0.04]"
                          >
                            Подтвердить
                          </button>
                          <button
                            type="button"
                            disabled={phoneResendSeconds > 0}
                            onClick={() => void sendPersistedPhoneCode()}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-black/15 bg-white px-3 text-xs font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                          >
                            {phoneResendSeconds > 0 ? `Повтор через ${phoneResendSeconds} с` : "Отправить код ещё раз"}
                          </button>
                        </div>
                      )}
                      {phoneStatusMessage ? <div className="mt-2 text-xs text-black/65">{phoneStatusMessage}</div> : null}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field label="Имя">
                      <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Телефон">
                      <input
                        value={profile.phone}
                        onChange={(e) => {
                          setProfileSaveError(null);
                          setProfile((p) => ({ ...p, phone: e.target.value }));
                        }}
                        className={inputClass}
                      />
                      {phoneVerified ? (
                        <div className="mt-2 text-xs font-medium text-green-700">Телефон подтвержден</div>
                      ) : null}
                    </Field>
                    <Field label="Город">
                      <input value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Предпочтительный способ связи">
                      <select
                        value={profile.preferredContact}
                        onChange={(e) => setProfile((p) => ({ ...p, preferredContact: e.target.value as UserProfile["preferredContact"] }))}
                        className={inputClass}
                      >
                        <option value="messages">Сообщения на сайте</option>
                        <option value="phone">Телефон</option>
                        <option value="email">Email</option>
                      </select>
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="О себе">
                        <textarea
                          value={profile.about}
                          onChange={(e) => setProfile((p) => ({ ...p, about: e.target.value }))}
                          className={`${inputClass} min-h-24 resize-y py-2.5`}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm text-black/70">
                    <div>
                      Email / логин: <span className="font-medium text-black/85">{accountContactDisplay}</span>
                    </div>
                    {registeredAt ? <div className="mt-1">Дата регистрации: {formatDate(registeredAt)}</div> : null}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const uid = auth.userId ?? "";
                          if (!uid) return;
                          setProfileSaveError(null);
                          const phoneTrim = (profile.phone ?? "").trim();
                          if (phoneTrim) {
                            const synced = syncProfilePhoneFromAccount(uid, profile.phone);
                            if (!synced.ok && synced.error === "PHONE_EXISTS") {
                              setProfileSaveError("Этот номер уже используется другим аккаунтом.");
                              return;
                            }
                            if (!synced.ok && synced.error === "INVALID_PHONE") {
                              setProfileSaveError(PHONE_VALIDATION_MESSAGE);
                              return;
                            }
                          }
                          try {
                            const nameTrim = (profile.name ?? "").trim();
                            const pr = await fetch("/api/account/profile", {
                              method: "PATCH",
                              credentials: "include",
                              cache: "no-store",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: nameTrim }),
                            });
                            if (!pr.ok) {
                              setProfileSaveError("Не удалось сохранить имя в аккаунте.");
                              return;
                            }
                            saveProfile(uid, { ...profile, name: nameTrim, avatarData: avatarDraft });
                            setProfile((p) => ({ ...p, name: nameTrim, avatarData: avatarDraft }));
                            invalidateAuthMeDedupeCache();
                            await refreshMe({ bypassCache: true });
                          } catch {
                            setProfileSaveError("Не удалось сохранить профиль. Попробуйте позже.");
                            return;
                          }
                          setPersistedPhone(phoneTrim);
                          setPhoneCodeOpen(false);
                          setPhoneCode("");
                          setPhoneStatusMessage(null);
                          setProfileSaved(true);
                          window.setTimeout(() => setProfileSaved(false), 1800);
                        })();
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
                      style={{ backgroundColor: "#ff7a00" }}
                    >
                      Сохранить профиль
                    </button>
                    {profileSaveError ? <div className="text-sm text-red-700">{profileSaveError}</div> : null}
                    {profileSaved ? <div className="text-sm text-green-700">Профиль сохранён</div> : null}
                  </div>
                </div>
              ) : mainTab === "settings" ? (
                <div className="max-w-md grid gap-5">
                  {me?.ok && me.user.deletionStatus === "pending_deletion" && typeof me.user.deleteScheduledAt === "number" ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-black/80">
                      <div>
                        Аккаунт будет удалён не ранее{" "}
                        {new Date(me.user.deleteScheduledAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        . В течение срока ожидания его можно восстановить.
                      </div>
                      <button
                        type="button"
                        disabled={deleteBusy}
                        onClick={() => void restoreAccount()}
                        className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-black/15 bg-white px-3 text-xs font-semibold text-black/85 hover:bg-black/[0.04] disabled:opacity-60"
                      >
                        Восстановить аккаунт
                      </button>
                    </div>
                  ) : null}
                  <section>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Безопасность</div>
                    <button
                      type="button"
                      onClick={() => setPasswordModalOpen(true)}
                      className="mt-2 inline-flex h-9 items-center justify-center rounded-xl border border-black/15 bg-white px-3.5 text-[13px] font-semibold text-black/85 hover:bg-black/[0.04]"
                    >
                      Сменить пароль
                    </button>
                  </section>
                  <section>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Аккаунт</div>
                    <button
                      type="button"
                      disabled={deleteBusy || Boolean(me?.ok && me.user.deletionStatus === "pending_deletion")}
                      onClick={() => {
                        setDeleteActionError(null);
                        setAccountDeletePhase("menu");
                      }}
                      className="mt-2 inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3.5 text-[13px] font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                    >
                      Удалить аккаунт
                    </button>
                  </section>
                  {deleteActionError && !accountDeletePhase ? (
                    <div className="text-sm text-red-700">{deleteActionError}</div>
                  ) : null}
                </div>
              ) : mainTab === "messages" ? (
                chatsLoading && chatRows.length === 0 ? (
                  <div className="text-sm text-black/60">Загрузка…</div>
                ) : chatRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white p-6 text-sm text-black/60">
                    У вас пока нет сообщений.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {chatRows.map((c) => {
                      const chatHref = appendReturnUrlQuery(
                        `/chat?listingId=${encodeURIComponent(c.listingId)}&peerUserId=${encodeURIComponent(c.otherUserId)}`,
                        "/account?tab=messages",
                      );
                      const preview = c.lastMessageText.trim() ? c.lastMessageText : "—";
                      const timeRu = new Date(c.lastMessageAt).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <Link
                          key={c.conversationId}
                          href={chatHref}
                          className="block rounded-2xl border border-black/10 bg-white px-3 py-2.5 transition-colors hover:bg-black/[0.02] sm:px-3.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className={"text-sm font-semibold text-black/90 " + (c.unreadCount > 0 ? "" : "font-medium")}>
                                {c.listingTitle}
                                {c.unreadCount > 0 ? (
                                  <span className="ml-2 inline-block h-2 w-2 rounded-full align-middle bg-orange-500" aria-label="Непрочитано" />
                                ) : null}
                              </div>
                              <div className="mt-1 text-sm text-black/70">
                                {messagesPeerCardLabel(c, peerPublicLabels, chatsLoading)}
                              </div>
                              <div className="mt-2 line-clamp-2 text-sm text-black/55">{preview}</div>
                              <div className="mt-2 text-xs font-semibold text-black/55 underline decoration-black/20">
                                Открыть чат
                              </div>
                            </div>
                            <div className="shrink-0 text-xs text-black/45">{timeRu}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )
              ) : mainTab === "favorites" ? (
                favoriteListings.length > 0 ? (
                  <div className={listingCardsContainerClass}>
                    <div className={favoritesListingGridClass}>
                    {favoriteListings.map((l) => {
                      const ownerId = (l.ownerId ?? "").trim();
                      const viewerId = (auth.userId ?? "").trim();
                      const isOwnListing = Boolean(ownerId && viewerId && ownerId === viewerId);
                      const canWrite = Boolean(ownerId) && !isOwnListing;
                      const chatHref = canWrite
                        ? appendReturnUrlQuery(
                            `/chat?listingId=${encodeURIComponent(normalizeListingId(l.id))}&peerUserId=${encodeURIComponent(ownerId)}`,
                            "/account?tab=favorites",
                          )
                        : "";
                      const favHref = appendReturnUrlQuery(listingPath(l.id, l.title), "/account?tab=favorites");
                      const pub = isPublicStatus(l.status);
                      const authorMetaLabel = accountListingCardAuthorDisplay(l.ownerId, peerPublicLabels, l);
                      const favViews = viewCounts[l.id] ?? 0;
                      return (
                        <div key={l.id} className={favoritesCardClass}>
                          <div className="shrink-0 space-y-0.5">
                            <Link
                              href={favHref}
                              className="line-clamp-2 block font-semibold text-[13px] leading-tight text-black/90 hover:underline"
                            >
                              {l.title}
                            </Link>
                            <div className="line-clamp-1 text-[11px] text-black/60">
                              {l.categoryName} · {l.city}
                            </div>
                          </div>

                          <ListingCardCover photos={l.photos ?? []} compact />

                          <div className={favoritesBottomSectionClass}>
                            <div className="flex flex-col gap-2 text-[11px]">
                              <div className="flex flex-wrap gap-1.5">
                                <span
                                  className={[
                                    "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                    l.status === "pending"
                                      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                                      : l.status === "rejected"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-green-200 bg-green-50 text-green-700",
                                  ].join(" ")}
                                >
                                  {statusLabel(l.status)}
                                </span>
                                {pub ? (
                                  <span className="inline-flex shrink-0 items-center rounded-full border border-black/10 bg-black/[0.03] px-1.5 py-0.5 text-[10px] font-medium leading-none text-black/70">
                                    Активно
                                  </span>
                                ) : null}
                              </div>
                              <ListingCardInlineMetaRow
                                createdAt={l.createdAt}
                                authorLabel={authorMetaLabel}
                                views={favViews}
                                priceRub={"price" in l ? l.price : undefined}
                              />
                            </div>

                            <div className={compactActionsRowClass}>
                              <Link href={favHref} className={compactActionsRowBtnSecondary}>
                                Открыть
                              </Link>
                              {isOwnListing && l.editToken ? (
                                <Link href={`/edit/${l.editToken}`} className={compactActionsRowBtnPrimary}>
                                  Редактировать
                                </Link>
                              ) : null}
                              {canWrite ? (
                                <Link href={chatHref} className={compactActionsRowBtnSecondary}>
                                  Написать
                                </Link>
                              ) : isOwnListing ? null : (
                                <button type="button" disabled title="Написание недоступно" className={compactActionsRowBtnSecondary}>
                                  Написать
                                </button>
                              )}
                              {isOwnListing ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!confirm("Удалить объявление?")) return;
                                    void deleteListing(l.id).catch(() => {});
                                  }}
                                  className={compactActionsRowBtnDanger}
                                >
                                  Удалить
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  const uid = auth.userId;
                                  if (!uid) return;
                                  toggleFavorite(uid, l.id);
                                }}
                                className={compactActionsRowBtnSecondary}
                              >
                                Убрать
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-4 text-[13px] text-black/60">
                    <div>В избранном пока ничего нет</div>
                    <div className="mt-1">Нажимайте на сердечко в объявлениях, чтобы сохранить их здесь.</div>
                  </div>
                )
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabButton label={`Все (${mineLive.length})`} active={statusTab === "all"} onClick={() => setStatusTab("all")} />
                    <TabButton label={`На проверке (${pending.length})`} active={statusTab === "pending"} onClick={() => setStatusTab("pending")} />
                    <TabButton label={`Опубликованные (${published.length})`} active={statusTab === "published"} onClick={() => setStatusTab("published")} />
                    <TabButton label={`Отклонённые (${rejected.length})`} active={statusTab === "rejected"} onClick={() => setStatusTab("rejected")} />
                    <TabButton label={`Корзина (${mineTrash.length})`} active={statusTab === "trash"} onClick={() => setStatusTab("trash")} />
                    <TabButton label={`Архив (${mineArchive.length})`} active={statusTab === "archive"} onClick={() => setStatusTab("archive")} />
                  </div>

                  <div className="mt-2">
                    {shown.length > 0 ? (
                      <div className={listingCardsContainerClass}>
                        <div className={listingGridClass}>
                        {statusTab === "trash"
                          ? shown.map((l) => (
                              <TrashListingCard
                                key={l.id}
                                listing={l}
                                onArchive={() => void archiveListingFromTrash(l.id).catch(() => {})}
                                onPermanentDelete={() => {
                                  if (!confirm("Удалить объявление навсегда? Это действие нельзя отменить.")) return;
                                  void permanentDeleteListingFromTrash(l.id).catch(() => {});
                                }}
                              />
                            ))
                          : statusTab === "archive"
                            ? shown.map((l) => <ArchiveListingCard key={l.id} listing={l} />)
                            : shown.map((l) => (
                                <MyListingCard
                                  key={l.id}
                                  listing={l}
                                  listingReturnHref="/account"
                                  views={viewCounts[l.id] ?? 0}
                                  ownerAuthorByApi={peerPublicLabels}
                                  onDealStatus={(next) => {
                                    void updateListing(l.id, (prev) => ({ ...prev, dealStatus: next } as Listing)).catch(() => {});
                                  }}
                                  onDelete={() => {
                                    if (!confirm("Удалить объявление?")) return;
                                    void deleteListing(l.id).catch(() => {});
                                  }}
                                />
                              ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-4 text-[13px] text-black/60">
                        Пока нет объявлений в этом разделе.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
              </>
            )}
          </div>
        </main>
      </div>
      {auth.userId ? (
        <PasswordChangeModal
          apiPath="/api/account/change-password"
          showTrigger={false}
          open={passwordModalOpen}
          onOpenChange={setPasswordModalOpen}
        />
      ) : null}

      {accountDeletePhase ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4"
          onClick={() => {
            if (!deleteBusy) {
              setDeleteActionError(null);
              setAccountDeletePhase(null);
            }
          }}
        >
          <div
            className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
          >
            <h2 id="account-delete-title" className="text-base font-semibold text-black/90">
              Удаление аккаунта
            </h2>

            {accountDeletePhase === "menu" ? (
              <>
                <p className="mt-2 text-sm text-black/70">Выберите способ удаления аккаунта.</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="text-sm font-semibold text-black/90">Удалить сразу</div>
                    <p className="mt-1 text-xs leading-snug text-black/60">
                      Аккаунт и персональные данные будут удалены без возможности восстановления.
                    </p>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteActionError(null);
                        setAccountDeletePhase("confirmImmediate");
                      }}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-[13px] font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                    >
                      Удалить сразу
                    </button>
                  </div>
                  <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="text-sm font-semibold text-black/90">Удалить через 10 дней</div>
                    <p className="mt-1 text-xs leading-snug text-black/60">
                      Аккаунт будет переведён в режим ожидания удаления. В течение 10 календарных дней его можно восстановить.
                    </p>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteActionError(null);
                        setAccountDeletePhase("confirmDelayed");
                      }}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg px-3 text-[13px] font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                      style={{ backgroundColor: "#ff7a00" }}
                    >
                      Удалить через 10 дней
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteActionError(null);
                      setAccountDeletePhase(null);
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-black/15 bg-white px-3.5 text-[13px] font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                  >
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-black/75">
                  {accountDeletePhase === "confirmImmediate"
                    ? "Вы действительно хотите удалить аккаунт сразу? Это действие нельзя отменить."
                    : "Аккаунт будет удалён через 10 календарных дней. В течение этого срока его можно восстановить."}
                </p>
                {deleteActionError ? <div className="mt-3 text-sm text-red-700">{deleteActionError}</div> : null}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteActionError(null);
                      setAccountDeletePhase("menu");
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-black/15 bg-white px-3.5 text-[13px] font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteActionError(null);
                        setAccountDeletePhase(null);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-black/15 bg-white px-3.5 text-[13px] font-semibold text-black/80 hover:bg-black/[0.04] disabled:opacity-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() =>
                        void executeDeletion(accountDeletePhase === "confirmImmediate" ? "immediate" : "delayed")
                      }
                      className="inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-[13px] font-semibold text-black shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                      style={{ backgroundColor: "#ff7a00" }}
                    >
                      {deleteBusy ? "Подождите…" : "Подтвердить"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {cropOpen ? (
        <AvatarCropModal
          src={avatarDraft}
          zoom={cropZoom}
          offsetX={cropX}
          offsetY={cropY}
          onZoom={setCropZoom}
          onOffsetX={setCropX}
          onOffsetY={setCropY}
          onClose={() => setCropOpen(false)}
          onApply={async () => {
            if (!avatarDraft) return setCropOpen(false);
            const cropped = await cropAvatarToDataUrl(avatarDraft, cropZoom, cropX, cropY);
            setAvatarDraft(cropped);
            setCropOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-black outline-none placeholder:text-black/40 focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.2)]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-black/70">
      <div className="mb-1">{label}</div>
      {children}
    </label>
  );
}

function AvatarCropModal({
  src,
  zoom,
  offsetX,
  offsetY,
  onZoom,
  onOffsetX,
  onOffsetY,
  onClose,
  onApply,
}: {
  src: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  onZoom: (v: number) => void;
  onOffsetX: (v: number) => void;
  onOffsetY: (v: number) => void;
  onClose: () => void;
  onApply: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Настроить фото"
      >
        <div className="text-lg font-semibold text-black/90">Настроить фото</div>
        <div className="mt-4 flex justify-center">
          <div className="relative h-64 w-64 overflow-hidden rounded-2xl bg-gray-100">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="Предпросмотр"
                className="absolute left-1/2 top-1/2 h-full w-full object-cover"
                style={{ transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${zoom})` }}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex justify-center">
          <div className="relative h-16 w-16 overflow-hidden rounded-full border border-black/10 bg-gray-100">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="Круглый предпросмотр"
                className="absolute left-1/2 top-1/2 h-full w-full object-cover"
                style={{ transform: `translate(-50%, -50%) translate(${offsetX * 0.25}px, ${offsetY * 0.25}px) scale(${zoom})` }}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm text-black/70">
            Масштаб
            <input type="range" min={1} max={2.5} step={0.01} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-sm text-black/70">
            Позиция по X
            <input type="range" min={-90} max={90} step={1} value={offsetX} onChange={(e) => onOffsetX(Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-sm text-black/70">
            Позиция по Y
            <input type="range" min={-90} max={90} step={1} value={offsetY} onChange={(e) => onOffsetY(Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.04]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onApply}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
            style={{ backgroundColor: "#ff7a00" }}
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

async function cropAvatarToDataUrl(src: string, zoom: number, offsetX: number, offsetY: number): Promise<string> {
  const img = await loadImage(src);
  const side = Math.min(img.naturalWidth, img.naturalHeight) / Math.max(1, zoom);
  const maxX = Math.max(0, (img.naturalWidth - side) / 2);
  const maxY = Math.max(0, (img.naturalHeight - side) / 2);
  const cx = img.naturalWidth / 2 + (offsetX / 90) * maxX;
  const cy = img.naturalHeight / 2 + (offsetY / 90) * maxY;
  const sx = clamp(cx - side / 2, 0, Math.max(0, img.naturalWidth - side));
  const sy = clamp(cy - side / 2, 0, Math.max(0, img.naturalHeight - side));
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-[32px] max-w-full shrink-0 items-center rounded-[13px] border px-3 text-[13px] font-semibold leading-none transition-colors",
        active ? "border-black/15 bg-black/5 text-black" : "border-black/10 bg-white text-black/70 hover:bg-black/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TrashListingCard({
  listing,
  onArchive,
  onPermanentDelete,
}: {
  listing: Listing;
  onArchive: () => void;
  onPermanentDelete: () => void;
}) {
  const snap = listing.deletedSnapshot;
  const title = (snap?.title ?? listing.title ?? "").trim() || "Объявление";
  const catLine = snap ? `${snap.type} · ${snap.category}` : `${listing.categoryName}`;
  const city = (snap?.city ?? listing.city ?? "").trim();
  const delAt = typeof listing.deletedAt === "number" ? listing.deletedAt : null;
  const purgeAt = typeof listing.deletePermanentlyAt === "number" ? listing.deletePermanentlyAt : null;
  return (
    <div className={compactCardClass}>
      <div className="shrink-0 space-y-1">
        <div className="line-clamp-2 font-semibold text-[13px] leading-tight text-black/90">{title}</div>
        <div className="line-clamp-2 text-[11px] text-black/60">
          {catLine}
          {city ? ` · ${city}` : ""}
        </div>
        {delAt ? (
          <div className="text-[10px] text-black/55">Удалено: {new Date(delAt).toLocaleString("ru-RU")}</div>
        ) : null}
        {purgeAt ? (
          <div className="text-[10px] text-black/55">
            Будет удалено навсегда: {new Date(purgeAt).toLocaleString("ru-RU")}
          </div>
        ) : null}
      </div>
      <div className={listingCardBottomSectionClass}>
        <div className={compactActionsRowClass}>
          <button type="button" onClick={onArchive} className={compactActionsRowBtnPrimary}>
            В архив
          </button>
          <button type="button" onClick={onPermanentDelete} className={compactActionsRowBtnDanger}>
            Удалить навсегда
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchiveListingCard({ listing }: { listing: Listing }) {
  const snap = listing.deletedSnapshot;
  const title = (snap?.title ?? listing.title ?? "").trim() || "Объявление";
  const catLine = snap ? `${snap.type} · ${snap.category}` : `${listing.categoryName}`;
  const city = (snap?.city ?? listing.city ?? "").trim();
  const archAt = typeof listing.archivedAt === "number" ? listing.archivedAt : null;
  return (
    <div className={compactCardClass}>
      <div className="shrink-0 space-y-1">
        <div className="line-clamp-2 font-semibold text-[13px] leading-tight text-black/90">{title}</div>
        <div className="line-clamp-2 text-[11px] text-black/60">
          {catLine}
          {city ? ` · ${city}` : ""}
        </div>
        {archAt ? (
          <div className="text-[10px] text-black/55">В архиве с: {new Date(archAt).toLocaleString("ru-RU")}</div>
        ) : null}
        <div className="text-[10px] text-black/50">Не отображается публично.</div>
      </div>
    </div>
  );
}

function MyListingCard({
  listing,
  listingReturnHref,
  views,
  ownerAuthorByApi,
  onDealStatus,
  onDelete,
}: {
  listing: Listing;
  listingReturnHref: string;
  views: number;
  ownerAuthorByApi: Readonly<Record<string, string>>;
  onDealStatus: (v: "active" | "in_progress" | "completed") => void;
  onDelete: () => void;
}) {
  const href = appendReturnUrlQuery(listingPath(listing.id, listing.title), listingReturnHref);
  const showReason =
    (listing.status === "pending" || listing.status === "rejected") && Boolean(listing.moderationReason?.trim());
  const dealStatusValue = (listing as unknown as { dealStatus?: unknown }).dealStatus;
  const ds =
    dealStatusValue === "in_progress" || dealStatusValue === "completed"
      ? (dealStatusValue as "in_progress" | "completed")
      : ("active" as const);
  const dealLabel = ds === "in_progress" ? "В процессе" : ds === "completed" ? "Завершено" : "Активно";
  const authorMetaLabel = accountListingCardAuthorDisplay(listing.ownerId, ownerAuthorByApi, listing);
  return (
    <div className={[compactCardClass, ds === "completed" ? "opacity-[0.72]" : ""].join(" ")}>
      <div className="shrink-0 space-y-0.5">
        <Link
          href={href}
          className="line-clamp-2 block font-semibold text-[13px] leading-tight text-black/90 hover:underline"
        >
          {listing.title}
        </Link>
        <div className="line-clamp-1 text-[11px] text-black/60">
          {listing.categoryName} · {listing.city}
        </div>
      </div>

      <ListingCardCover photos={listing.photos ?? []} />

      <div className={listingCardBottomSectionClass}>
        <div className="flex flex-col gap-2 text-[11px]">
          <div className="flex flex-wrap gap-1.5">
            <span
              className={[
                "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                listing.status === "pending"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                  : listing.status === "rejected"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700",
              ].join(" ")}
            >
              {statusLabel(listing.status)}
            </span>
            <span className="inline-flex shrink-0 items-center rounded-full border border-black/10 bg-black/[0.03] px-1.5 py-0.5 text-[10px] font-medium leading-none text-black/70">
              {dealLabel}
            </span>
          </div>
          <ListingCardInlineMetaRow
            createdAt={listing.createdAt}
            authorLabel={authorMetaLabel}
            views={views}
            priceRub={"price" in listing ? listing.price : undefined}
          />
          <label className="flex min-h-9 min-w-0 items-center gap-2 text-[10px] text-black/55">
            Статус сделки
            <select
              value={ds}
              onChange={(e) => onDealStatus(e.target.value as "active" | "in_progress" | "completed")}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-2 text-sm text-black/80"
            >
              <option value="active">Активно</option>
              <option value="in_progress">В процессе</option>
              <option value="completed">Завершено</option>
            </select>
          </label>
          {showReason ? (
            <div className="line-clamp-1 text-[10px] text-black/60">
              Причина: <span className="text-black/75">{listing.moderationReason}</span>
            </div>
          ) : null}
        </div>

        <div className={compactActionsRowClass}>
        {isPublicStatus(listing.status) ? (
          <Link href={href} className={compactActionsRowBtnSecondary}>
            Открыть
          </Link>
        ) : null}
        {listing.editToken ? (
          <Link href={`/edit/${listing.editToken}`} className={compactActionsRowBtnPrimary}>
            Редактировать
          </Link>
        ) : null}
        <button type="button" onClick={onDelete} className={compactActionsRowBtnDanger}>
          Удалить
        </button>
        </div>
      </div>
    </div>
  );
}

