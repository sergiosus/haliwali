"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReturnLink } from "../components/ReturnLink";
import { useAuth } from "../lib/auth";
import type { Listing } from "../lib/listings";
import { useListingsStore } from "../lib/listings";
import { FAST_REPLY_BADGE_LABEL, formatLastSeenRu } from "../lib/trustUi";
import { ReportModal } from "../components/ReportModal";
import { WebRtcCallModal } from "../components/WebRtcCallModal";
import { pingPresenceThrottled } from "../lib/clientPresencePing";
import { mergeAllDeletions } from "../lib/chatMessageMerge";
import type { MessageDeletionRow } from "../lib/serverChatMessageStore";
import { fastReplyEligibleFromLocalChats } from "../lib/chatFastReply";
import {
  chatUploadExtFromFileName,
  normalizeChatUploadExt,
  validateChatUploadClient,
} from "../lib/chatUploadConstraints";
import { normalizeListingId } from "../lib/listingId";
import { appendReturnUrlQuery, pathnameWithSearchSansReturn } from "../lib/returnNavigation";
import { listingPath } from "../lib/seo";
import { getSafePublicName } from "@/lib/utils/getSafePublicName";
import {
  getPublicSenderName,
  LEGACY_CHAT_SENDER_PLACEHOLDERS,
  mergeClientStoresToPublicUser,
} from "../lib/chatSenderDisplay";
import {
  looksLikeTechnicalUserId,
  PUBLIC_DISPLAY_NAME_FALLBACK,
  isPublicDisplayNameFallback,
} from "../lib/getPublicUserName";
import { formatListingCardAuthor, LISTING_AUTHOR_FALLBACK_LABEL } from "../lib/listingCardAuthorDisplay";

/** Mobile: full viewport column; desktop: centered shell with bottom padding. */
const chatPageShellOuterClass =
  "flex min-h-[100dvh] w-full flex-1 flex-col px-3 pt-3 pb-0 md:min-h-0 md:px-4 md:pt-6 md:pb-14";
/** Inner column grows on mobile so the chat card can fill space above the composer. */
const chatPageShellInnerClass = "mx-auto flex w-full max-w-[920px] min-h-0 flex-1 flex-col";
const chatComposerIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-black/70 hover:bg-black/[0.03] md:h-11 md:w-11 md:rounded-2xl";

type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  createdAt: number;
  type: "text" | "file";
  text?: string;
  fileUrl?: string;
  fileName?: string;
  replyToMessageId?: string;
  replyToText?: string;
  editedAt?: string;
  deletedForEveryone?: boolean;
  deletedAt?: number;
  deletedByUserId?: string;
  deletedForUserIds?: string[];
};

type ChatStore = Record<string, ChatMessage[]>;

const STORAGE_KEY = "haliwali_chats";

const CHAT_QUICK_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😂",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😢",
  "😡",
  "👍",
  "👎",
  "👋",
  "🙏",
  "🔥",
  "❤️",
  "🎉",
  "✅",
  "❌",
];

/** Same budget as `app/lib/uploadClient.ts` for slow mobile uploads. */
const CHAT_UPLOAD_FETCH_TIMEOUT_MS = 120_000;
const CHAT_SEND_FETCH_TIMEOUT_MS = 120_000;
const CHAT_UPLOAD_FAIL_MESSAGE = "Не удалось загрузить файл. Проверьте интернет и попробуйте снова.";
const CHAT_UPLOAD_TIMEOUT_MESSAGE =
  "Превышено время ожидания при загрузке файла. Проверьте интернет и попробуйте снова.";
const CHAT_SEND_FILE_FAIL_MESSAGE = "Не удалось отправить вложение. Проверьте интернет и попробуйте снова.";
const CHAT_SEND_FILE_TIMEOUT_MESSAGE =
  "Превышено время ожидания при отправке вложения. Проверьте интернет и попробуйте снова.";
const CHAT_USER_BLOCKED_MESSAGE = "Сообщение недоступно. Пользователь заблокирован.";

function nextPollBackoffMs(failCount: number, capMs = 60_000, baseMs = 2000): number {
  const n = Math.min(Math.max(failCount, 1), 6);
  return Math.min(capMs, baseMs * 2 ** n);
}

function createIncomingCallRingAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** One short ring pulse on an already-`running` context. Must not throw. */
function playIncomingRingPulse(ctx: AudioContext): void {
  try {
    if (ctx.state !== "running") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.06;
    o.frequency.value = 520;
    o.start();
    window.setTimeout(() => {
      try {
        o.stop();
      } catch {
        /* noop */
      }
      try {
        o.disconnect();
        g.disconnect();
      } catch {
        /* noop */
      }
    }, 220);
  } catch {
    /* noop */
  }
}

function formatChatMessageTime(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Имя для сохранения на сервере: публично безопасное (без фрагментов email). */
function buildSenderNameForApi(userId: string): string {
  const id = userId.trim();
  if (typeof window === "undefined") return getSafePublicName({ userId: id || "0000" });
  const merged = mergeClientStoresToPublicUser(id);
  if (merged?.name?.trim()) {
    return getSafePublicName({ userId: id, displayName: merged.name.trim() });
  }
  return getSafePublicName({ userId: id });
}

function isImageExt(extOrFileName: string) {
  const ext = extOrFileName.includes(".")
    ? normalizeChatUploadExt(chatUploadExtFromFileName(extOrFileName))
    : normalizeChatUploadExt(extOrFileName);
  return ext === "jpg" || ext === "png" || ext === "webp";
}

function readStore(): ChatStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ChatStore;
  } catch {
    return {};
  }
}

function writeStore(next: ChatStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function hydrateChatMessages(raw: unknown[], listingId: string): ChatMessage[] {
  return raw.map((m: unknown, idx: number) => {
    if (m && typeof m === "object" && (((m as { type?: string }).type === "text") || (m as { type?: string }).type === "file")) {
      const o = m as Record<string, unknown>;
      const legacyOwnerId = typeof o.ownerId === "string" ? o.ownerId : "";
      const senderId = (typeof o.senderId === "string" ? o.senderId : legacyOwnerId) || "";
      const createdAt =
        typeof o.createdAt === "number" ? o.createdAt : typeof o.ts === "number" ? (o.ts as number) : Date.now();
      const rawSenderName = typeof o.senderName === "string" ? (o.senderName as string).trim() : "";
      const senderName =
        rawSenderName && !LEGACY_CHAT_SENDER_PLACEHOLDERS.has(rawSenderName) ? rawSenderName : "";
      const chatIdValue =
        typeof o.chatId === "string" && o.chatId ? (o.chatId as string) : `${listingId}::${senderId}`;
      const deletedForUserIds = Array.isArray(o.deletedForUserIds)
        ? ((o.deletedForUserIds as unknown[]).filter((x): x is string => typeof x === "string"))
        : undefined;
      return {
        ...(m as Omit<ChatMessage, "senderId" | "senderName" | "createdAt" | "chatId">),
        chatId: chatIdValue,
        senderId,
        senderName,
        createdAt,
        deletedForEveryone: typeof o.deletedForEveryone === "boolean" ? o.deletedForEveryone : undefined,
        deletedAt: typeof o.deletedAt === "number" ? o.deletedAt : undefined,
        deletedByUserId: typeof o.deletedByUserId === "string" ? o.deletedByUserId : undefined,
        deletedForUserIds,
      } as ChatMessage;
    }
    const mm = (m ?? {}) as { createdAt?: number; ts?: number; text?: unknown; ownerId?: unknown; id?: unknown };
    const createdAt = typeof mm.createdAt === "number" ? mm.createdAt : Date.now();
    const legacyText = typeof mm.text === "string" ? mm.text : "";
    return {
      id: typeof mm.id === "string" ? mm.id : `legacy-${createdAt}-${idx}`,
      chatId: `${listingId}::legacy`,
      senderId: typeof mm.ownerId === "string" ? mm.ownerId : "",
      senderName: PUBLIC_DISPLAY_NAME_FALLBACK,
      createdAt,
      type: "text",
      text: legacyText,
    } as ChatMessage;
  });
}

function isEveryoneDeleted(m: ChatMessage) {
  return Boolean(m.deletedForEveryone);
}

function serverRowToChatMessage(sm: Record<string, unknown>, chatId: string): ChatMessage {
  const type = sm.type === "file" ? "file" : "text";
  return {
    id: String(sm.id ?? ""),
    chatId,
    senderId: String(sm.senderId ?? ""),
    senderName: String(sm.senderName ?? "").trim(),
    createdAt: typeof sm.createdAt === "number" ? sm.createdAt : Date.now(),
    type,
    text: typeof sm.text === "string" ? sm.text : undefined,
    fileUrl: typeof sm.fileUrl === "string" ? sm.fileUrl : undefined,
    fileName: typeof sm.fileName === "string" ? sm.fileName : undefined,
    replyToMessageId: typeof sm.replyToMessageId === "string" ? sm.replyToMessageId : undefined,
    replyToText: typeof sm.replyToText === "string" ? sm.replyToText : undefined,
    editedAt: typeof sm.editedAt === "string" ? sm.editedAt : undefined,
  };
}

function mergeChatLists(server: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of server) {
    if (m.id) byId.set(m.id, { ...m });
  }
  for (const m of local) {
    if (!m.id) continue;
    const ex = byId.get(m.id);
    if (!ex) {
      byId.set(m.id, { ...m });
      continue;
    }
    const mergedSender = (ex.senderName ?? "").trim() || (m.senderName ?? "").trim();
    byId.set(m.id, {
      ...ex,
      ...(mergedSender ? { senderName: mergedSender } : {}),
      deletedForEveryone: m.deletedForEveryone ?? ex.deletedForEveryone,
      deletedAt: m.deletedAt ?? ex.deletedAt,
      deletedByUserId: m.deletedByUserId ?? ex.deletedByUserId,
      deletedForUserIds: m.deletedForUserIds ?? ex.deletedForUserIds,
      editedAt: m.editedAt ?? ex.editedAt,
    });
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function ChatAuthGate() {
  const auth = useAuth();
  if (auth.status !== "ready") {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className={chatPageShellOuterClass}>
          <div className={`${chatPageShellInnerClass} text-sm text-black/60`}>Загрузка…</div>
        </div>
      </div>
    );
  }
  if (!auth.userId) {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className={chatPageShellOuterClass}>
          <div className={chatPageShellInnerClass}>
          <ReturnLink fallback="/" className="text-sm text-black/60 hover:text-black" />
          <div className="mt-4 rounded-3xl border border-black/10 bg-white p-6">
            <div className="text-lg font-semibold tracking-tight">Чат</div>
            <div className="mt-2 text-sm text-black/60">Войдите, чтобы открыть чат.</div>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
              style={{ backgroundColor: "#ff7a00" }}
            >
              Войти
            </Link>
          </div>
          </div>
        </div>
      </div>
    );
  }
  return <ChatInner />;
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-black/[0.03] text-black">
          <div className={chatPageShellOuterClass}>
            <div className={`${chatPageShellInnerClass} text-sm text-black/60`}>Загрузка…</div>
          </div>
        </div>
      }
    >
      <ChatAuthGate />
    </Suspense>
  );
}

function ChatInner() {
  const auth = useAuth();
  const sp = useSearchParams();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // `useSearchParams()` can be empty during SSR render, causing hydration mismatches.
  // Gate query-derived values behind `mounted` so server + first client render match.
  const listingIdRaw = mounted ? (sp.get("listingId") ?? "") : "";
  const listingId = useMemo(() => normalizeListingId(listingIdRaw), [listingIdRaw]);
  const peerUserIdRaw = mounted ? (sp.get("peerUserId") ?? "").trim() : "";
  const chatSelfReturnHref = useMemo(
    () => pathnameWithSearchSansReturn(pathname, mounted ? sp : new URLSearchParams()),
    [mounted, pathname, sp],
  );
  const currentUserId = auth.userId ?? "";

  const [ad, setAd] = useState<{
    id: string;
    title: string;
    price?: number;
    city: string;
    category: string;
    images?: string[];
    ownerId?: string;
    authorPublicName?: string;
  } | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [adNotFound, setAdNotFound] = useState(false);
  const [opponentPublic, setOpponentPublic] = useState<{
    userId: string;
    displayName: string;
    createdAt: number;
    lastSeenAt: number | null;
    phoneVerified: boolean;
    fastReply: boolean;
    activeListingCount: number;
  } | null>(null);
  const [listingOwnerPublic, setListingOwnerPublic] = useState<{
    userId: string;
    displayName: string;
    name?: string;
    identityLabel?: string;
    createdAt: number;
    lastSeenAt: number | null;
    phoneVerified: boolean;
    fastReply: boolean;
    activeListingCount: number;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const { findById, listings } = useListingsStore();
  const localListing = useMemo(() => {
    if (!listingId) return null;
    const direct = findById(listingId);
    if (direct) return direct;
    // If chat listingId is a slugified route param that includes id prefix, try prefix match.
    for (const l of listings) {
      if (listingId === l.id) return l;
      if (listingId.startsWith(`${l.id}-`)) return l;
      if (listingId.startsWith(`${l.id}--`)) return l;
    }
    return null;
  }, [findById, listingId, listings]);

  const localAdFallback = useMemo(() => {
    const l = localListing as Listing | null;
    if (!l) return null;
    const maybePrice = "price" in l ? l.price : undefined;
    return {
      id: l.id,
      title: l.title,
      price: typeof maybePrice === "number" ? maybePrice : undefined,
      city: l.city,
      category: l.categoryName,
      images: Array.isArray(l.photos) ? l.photos.slice(0, 5) : undefined,
      ownerId: typeof l.ownerId === "string" ? l.ownerId : undefined,
      authorPublicName:
        typeof l.authorPublicName === "string" && l.authorPublicName.trim() ? l.authorPublicName.trim() : undefined,
    };
  }, [localListing]);

  const displayAd = ad ?? localAdFallback;

  const listingOwnerId = useMemo(() => {
    const fromAd = (displayAd as { ownerId?: string } | null)?.ownerId;
    if (typeof fromAd === "string" && fromAd.trim()) return fromAd.trim();
    return ((localListing as Listing | null)?.ownerId ?? "").trim();
  }, [displayAd, localListing]);

  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerWrapRef = useRef<HTMLDivElement | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Один проброс localStorage→сервер на chatId за сессию (пустой GET, есть локальные сообщения). */
  const hydrateLocalToServerRef = useRef<Set<string>>(new Set());
  /** Prevents double-submit before `isUploading` state commits (mobile double-tap). */
  const chatFileUploadLockRef = useRef(false);
  const syncChatFlightRef = useRef(false);
  const syncChatFailCountRef = useRef(0);
  const syncChatBackoffUntilRef = useRef(0);
  const loadPeersFlightRef = useRef(false);
  const loadPeersFailCountRef = useRef(0);
  const loadPeersBackoffUntilRef = useRef(0);
  const outgoingStatusFlightRef = useRef(false);
  const incomingPollFlightRef = useRef(false);
  const incomingPollFailCountRef = useRef(0);
  const incomingPollBackoffUntilRef = useRef(0);
  /** Reused for the whole incoming-call ring session (avoid `new AudioContext` every beep). */
  const incomingRingAudioCtxRef = useRef<AudioContext | null>(null);
  /** While true, interval skips beeps until user taps «Включить звук звонка». */
  const incomingRingAwaitingGestureRef = useRef(false);
  /** Avoid repeated `setState` when autoplay stays blocked. */
  const incomingRingUnlockPromptShownRef = useRef(false);
  const [replyDraft, setReplyDraft] = useState<{
    messageId: string;
    senderLabel: string;
    text?: string;
    fileName?: string;
  } | null>(null);
  const [editDraft, setEditDraft] = useState<{
    messageId: string;
  } | null>(null);
  const [messageActionsTargetId, setMessageActionsTargetId] = useState<string | null>(null);

  const [outgoingRingOpen, setOutgoingRingOpen] = useState(false);
  const [outgoingCallId, setOutgoingCallId] = useState<string | null>(null);
  const [incomingCallInfo, setIncomingCallInfo] = useState<null | {
    callId: string;
    callerId: string;
    callerName: string;
  }>(null);
  /** iOS / in-app browsers: show unlock control when `AudioContext` stays suspended without a gesture. */
  const [incomingCallRingShowUnlockButton, setIncomingCallRingShowUnlockButton] = useState(false);
  const [rtcOpen, setRtcOpen] = useState(false);
  const [rtcRole, setRtcRole] = useState<"caller" | "callee">("caller");
  const [rtcCallId, setRtcCallId] = useState<string | null>(null);
  const [rtcPeerUserId, setRtcPeerUserId] = useState("");
  const [rtcPeerHint, setRtcPeerHint] = useState<string | undefined>(undefined);
  const [callRejectedBanner, setCallRejectedBanner] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<null | { messageId: string }>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [peerBlock, setPeerBlock] = useState({
    blockedBetween: false,
    blockedByMe: false,
    blockedByPeer: false,
  });
  const [peerBlockLoading, setPeerBlockLoading] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);

  /** Владелец объявления: варианты диалогов по этому listingId (если в URL нет peerUserId). */
  const [ownerListingPeerOptions, setOwnerListingPeerOptions] = useState<
    Array<{
      conversationId: string;
      otherUserId: string;
      lastMessageAt: number;
      lastMessageText: string;
      participantPublicName: string;
    }>
  >([]);
  const [ownerPeerPick, setOwnerPeerPick] = useState("");

  const currentSenderId = currentUserId;
  const outboundSenderNameForApi = useMemo(() => buildSenderNameForApi(currentSenderId), [currentSenderId]);

  const buyerIdResolved = useMemo(() => {
    const ownerId = listingOwnerId;
    if (!ownerId || !currentSenderId) return "";
    if (currentSenderId !== ownerId) return currentSenderId;
    const fromMsgs = msgs.find((m) => m.senderId && m.senderId !== ownerId)?.senderId ?? "";
    const fromUrl = peerUserIdRaw.trim();
    const fromPick = ownerPeerPick.trim();
    const fromSingleServer =
      ownerListingPeerOptions.length === 1 ? ownerListingPeerOptions[0]!.otherUserId.trim() : "";
    return (fromUrl || fromMsgs || fromPick || fromSingleServer).trim();
  }, [listingOwnerId, currentSenderId, msgs, peerUserIdRaw, ownerPeerPick, ownerListingPeerOptions]);

  const displayNameForUserId = useCallback((userId: string) => {
    if (!userId) return "Собеседник";
    return getPublicSenderName({ userId, emptyLabel: "Собеседник" });
  }, []);

  const opponent = useMemo(() => {
    const ownerId = listingOwnerId;
    if (!ownerId || !currentSenderId) return { id: "", name: "Собеседник" };
    if (currentSenderId !== ownerId) {
      return { id: ownerId, name: displayNameForUserId(ownerId) };
    }
    const otherId = buyerIdResolved;
    const other = msgs.find((m) => m.senderId && m.senderId !== ownerId);
    const otherName = getPublicSenderName({
      userId: otherId,
      senderNameFromMessage: other?.senderName,
      emptyLabel: "Собеседник",
    });
    return { id: otherId, name: otherName };
  }, [currentSenderId, listingOwnerId, buyerIdResolved, msgs, displayNameForUserId]);

  const opponentLabel = useMemo(() => {
    const hint =
      opponentPublic?.userId === opponent.id && opponent.id ? opponentPublic.displayName : undefined;
    const sid = msgs.find((m) => m.senderId && m.senderId === opponent.id)?.senderName;
    return getPublicSenderName({
      userId: opponent.id,
      displayHint: hint,
      senderNameFromMessage: sid,
      emptyLabel: "Собеседник",
    });
  }, [opponent.id, opponentPublic, msgs]);

  /** Пустая строка — строку «Автор» не показываем; «Вы» — своя карточка. */
  const listingOwnerAuthorLabel = useMemo(() => {
    const oid = listingOwnerId.trim();
    if (!oid) return "";
    if (currentUserId && oid === currentUserId) return "Вы";
    const storedPub =
      (displayAd as { authorPublicName?: string } | null)?.authorPublicName?.trim() ??
      (localListing as Listing | null)?.authorPublicName?.trim() ??
      "";
    const sid = msgs.find((m) => m.senderId === oid)?.senderName?.trim() ?? "";
    const msgAsDisplay =
      sid &&
      !sid.includes("@") &&
      !isPublicDisplayNameFallback(sid) &&
      !LEGACY_CHAT_SENDER_PLACEHOLDERS.has(sid)
        ? sid
        : "";

    const fromCard = formatListingCardAuthor({
      ownerId: oid,
      publicApi:
        listingOwnerPublic?.userId === oid ?
          {
            identityLabel: (listingOwnerPublic.identityLabel ?? "").trim() || undefined,
            name: (listingOwnerPublic.name ?? "").trim() || undefined,
          }
        : null,
      storedAuthorName: storedPub || undefined,
    });

    const technicalStored = Boolean(storedPub && looksLikeTechnicalUserId(storedPub));
    if (
      msgAsDisplay &&
      (technicalStored ||
        fromCard === PUBLIC_DISPLAY_NAME_FALLBACK ||
        fromCard === LISTING_AUTHOR_FALLBACK_LABEL)
    )
      return msgAsDisplay;
    return fromCard;
  }, [listingOwnerId, currentUserId, listingOwnerPublic, msgs, displayAd, localListing]);

  const listingOwnerFastReplyEligible = useMemo(
    () =>
      listingOwnerId && listingOwnerId !== currentUserId ? fastReplyEligibleFromLocalChats(listingOwnerId) : false,
    [listingOwnerId, currentUserId],
  );

  const messageHeaderName = useCallback(
    (m: ChatMessage): string => {
      const isSelf = m.senderId === currentSenderId;
      const hint =
        opponent.id && m.senderId === opponent.id && opponentPublic?.userId === opponent.id
          ? opponentPublic.displayName
          : undefined;
      return getPublicSenderName({
        userId: m.senderId,
        senderNameFromMessage: m.senderName,
        displayHint: hint,
        emptyLabel: isSelf ? "Вы" : PUBLIC_DISPLAY_NAME_FALLBACK,
      });
    },
    [currentSenderId, opponent.id, opponentPublic],
  );

  useEffect(() => {
    void pingPresenceThrottled({ force: true });
  }, [listingId]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") void pingPresenceThrottled();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const oid = opponent.id;
    if (!oid || !oid.startsWith("user-")) {
      queueMicrotask(() => setOpponentPublic(null));
      return;
    }
    let cancelled = false;
    void fetch(`/api/users/${encodeURIComponent(oid)}/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const dto = d as Partial<NonNullable<typeof opponentPublic>>;
        if (typeof dto.userId !== "string" || !dto.userId) return;
        setOpponentPublic(dto as NonNullable<typeof opponentPublic>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [opponent.id]);

  useEffect(() => {
    const oid = listingOwnerId;
    if (!oid || !oid.startsWith("user-")) {
      queueMicrotask(() => setListingOwnerPublic(null));
      return;
    }
    let cancelled = false;
    void fetch(`/api/users/${encodeURIComponent(oid)}/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const dto = d as Partial<NonNullable<typeof listingOwnerPublic>>;
        if (typeof dto.userId !== "string" || !dto.userId) return;
        setListingOwnerPublic(dto as NonNullable<typeof listingOwnerPublic>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listingOwnerId]);

  useEffect(() => {
    setOwnerPeerPick("");
  }, [listingId, peerUserIdRaw]);

  const loadOwnerListingPeers = useCallback(async () => {
    if (!mounted || !listingId || !auth.userId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const nowPeers = Date.now();
    if (nowPeers < loadPeersBackoffUntilRef.current) return;
    if (loadPeersFlightRef.current) return;
    if (listingOwnerId !== auth.userId) {
      setOwnerListingPeerOptions([]);
      return;
    }
    if (peerUserIdRaw.trim()) {
      setOwnerListingPeerOptions([]);
      return;
    }
    loadPeersFlightRef.current = true;
    try {
      const r = await fetch("/api/chats", { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        loadPeersFailCountRef.current += 1;
        loadPeersBackoffUntilRef.current = Date.now() + nextPollBackoffMs(loadPeersFailCountRef.current);
        return;
      }
      loadPeersFailCountRef.current = 0;
      loadPeersBackoffUntilRef.current = 0;
      const d = (await r.json()) as { conversations?: unknown };
      const convs = d.conversations;
      if (!Array.isArray(convs)) return;
      const lid = normalizeListingId(listingId);
      const rows = convs
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
        .filter((c) => normalizeListingId(String(c.listingId ?? "")) === lid)
        .map((c) => ({
          conversationId: String(c.conversationId ?? ""),
          otherUserId: String(c.otherUserId ?? ""),
          lastMessageAt: typeof c.lastMessageAt === "number" ? c.lastMessageAt : 0,
          lastMessageText: String(c.lastMessageText ?? ""),
          participantPublicName: String(c.participantPublicName ?? "").trim(),
        }))
        .filter((x) => x.otherUserId && x.conversationId)
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      setOwnerListingPeerOptions(rows);
    } catch {
      loadPeersFailCountRef.current += 1;
      loadPeersBackoffUntilRef.current = Date.now() + nextPollBackoffMs(loadPeersFailCountRef.current);
    } finally {
      loadPeersFlightRef.current = false;
    }
  }, [mounted, listingId, auth.userId, listingOwnerId, peerUserIdRaw]);

  useEffect(() => {
    void loadOwnerListingPeers();
  }, [loadOwnerListingPeers]);

  useEffect(() => {
    if (!mounted || !listingId || !auth.userId) return;
    if (listingOwnerId !== auth.userId) return;
    if (peerUserIdRaw.trim()) return;
    const tid = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadOwnerListingPeers();
    }, 45000);
    return () => window.clearInterval(tid);
  }, [mounted, listingId, auth.userId, listingOwnerId, peerUserIdRaw, loadOwnerListingPeers]);

  const showOwnerPeerPicker = useMemo(() => {
    if (!listingOwnerId || !auth.userId || auth.userId !== listingOwnerId) return false;
    if (peerUserIdRaw.trim()) return false;
    if (ownerListingPeerOptions.length <= 1) return false;
    return !buyerIdResolved.trim();
  }, [listingOwnerId, auth.userId, peerUserIdRaw, ownerListingPeerOptions.length, buyerIdResolved]);

  const canManagePeerBlock = Boolean(
    auth.userId && opponent.id && opponent.id !== currentSenderId && !showOwnerPeerPicker,
  );
  const chatIsBlocked = peerBlock.blockedBetween;
  const composerDisabled = isUploading || chatIsBlocked;

  const chatId = useMemo(() => {
    const ownerId = listingOwnerId.trim();
    const buyer = buyerIdResolved.trim();
    if (!listingId || !ownerId || !buyer) return "";
    return `${listingId}::${ownerId}::${buyer}`;
  }, [listingId, listingOwnerId, buyerIdResolved]);

  const refreshPeerBlockStatus = useCallback(async () => {
    const peerUserId = opponent.id.trim();
    if (!auth.userId || !peerUserId || peerUserId === auth.userId) {
      setPeerBlock({ blockedBetween: false, blockedByMe: false, blockedByPeer: false });
      return;
    }
    setPeerBlockLoading(true);
    try {
      const res = await fetch(`/api/chats/users/block?peerUserId=${encodeURIComponent(peerUserId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        blockedBetween?: boolean;
        blockedByMe?: boolean;
        blockedByPeer?: boolean;
      };
      if (!res.ok || !data.ok) {
        setPeerBlock({ blockedBetween: false, blockedByMe: false, blockedByPeer: false });
        return;
      }
      setPeerBlock({
        blockedBetween: Boolean(data.blockedBetween),
        blockedByMe: Boolean(data.blockedByMe),
        blockedByPeer: Boolean(data.blockedByPeer),
      });
    } catch {
      setPeerBlock({ blockedBetween: false, blockedByMe: false, blockedByPeer: false });
    } finally {
      setPeerBlockLoading(false);
    }
  }, [auth.userId, opponent.id]);

  useEffect(() => {
    if (!mounted) return;
    void refreshPeerBlockStatus();
  }, [mounted, refreshPeerBlockStatus]);

  useEffect(() => {
    if (!chatMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const root = chatMenuRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setChatMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [chatMenuOpen]);

  const blockPeerUser = useCallback(async () => {
    const peerUserId = opponent.id.trim();
    if (!peerUserId || blockBusy) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/chats/users/block", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerUserId }),
      });
      if (!res.ok) return;
      setBlockModalOpen(false);
      setChatMenuOpen(false);
      setMessageActionsTargetId(null);
      await refreshPeerBlockStatus();
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, opponent.id, refreshPeerBlockStatus]);

  const unblockPeerUser = useCallback(async () => {
    const peerUserId = opponent.id.trim();
    if (!peerUserId || blockBusy) return;
    setBlockBusy(true);
    try {
      const res = await fetch("/api/chats/users/block", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerUserId }),
      });
      if (!res.ok) return;
      setChatMenuOpen(false);
      setMessageActionsTargetId(null);
      await refreshPeerBlockStatus();
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, opponent.id, refreshPeerBlockStatus]);

  const beginOutgoingCall = useCallback(async () => {
    if (typeof window === "undefined") return;
    setSendError(null);
    if (chatIsBlocked) {
      setSendError(CHAT_USER_BLOCKED_MESSAGE);
      return;
    }
    if (!chatId || !opponent.id) {
      setSendError(
        listingOwnerId && currentSenderId === listingOwnerId
          ? "Откройте чат из раздела «Сообщения» в кабинете или перейдите по чату с объявления."
          : "Не удалось определить чат. Обновите страницу.",
      );
      return;
    }
    const participantIds = [currentSenderId, opponent.id].filter(Boolean);
    const res = await fetch("/api/calls/start", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        participantIds,
        callerDisplayName: outboundSenderNameForApi,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      call?: { callId?: string };
      error?: string;
    };
    if (!res.ok || !data.ok || !data.call?.callId) {
      if (data.error === "USER_BLOCKED") {
        setSendError(CHAT_USER_BLOCKED_MESSAGE);
        void refreshPeerBlockStatus();
      } else {
        setSendError(data.error === "FORBIDDEN" ? "Нельзя начать звонок." : "Не удалось начать звонок.");
      }
      return;
    }
    setOutgoingCallId(data.call.callId);
    setOutgoingRingOpen(true);
  }, [
    chatId,
    chatIsBlocked,
    opponent.id,
    currentSenderId,
    listingOwnerId,
    outboundSenderNameForApi,
    refreshPeerBlockStatus,
  ]);

  async function cancelOutgoingCall() {
    const id = outgoingCallId;
    setOutgoingRingOpen(false);
    setOutgoingCallId(null);
    if (!id) return;
    await fetch("/api/calls/cancel", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: id }),
    });
  }

  async function acceptIncomingCall() {
    if (!incomingCallInfo) return;
    const { callId, callerId, callerName } = incomingCallInfo;
    const res = await fetch("/api/calls/accept", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (!res.ok) return;
    setIncomingCallInfo(null);
    setRtcPeerUserId(callerId);
    {
      const hn = (callerName ?? "").trim();
      setRtcPeerHint(hn && !isPublicDisplayNameFallback(hn) ? hn : undefined);
    }
    setRtcCallId(callId);
    setRtcRole("callee");
    setRtcOpen(true);
  }

  async function declineIncomingCall() {
    if (!incomingCallInfo) return;
    const callId = incomingCallInfo.callId;
    setIncomingCallInfo(null);
    await fetch("/api/calls/decline", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
  }

  const endRtcCall = useCallback(() => {
    const id = rtcCallId;
    setRtcOpen(false);
    setRtcCallId(null);
    setRtcPeerUserId("");
    setRtcPeerHint(undefined);
    if (id) {
      void fetch("/api/calls/end", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: id }),
      });
    }
  }, [rtcCallId]);

  const unlockIncomingCallRingSound = useCallback(async () => {
    incomingRingAwaitingGestureRef.current = false;
    let ctx = incomingRingAudioCtxRef.current;
    if (!ctx) {
      ctx = createIncomingCallRingAudioContext();
      incomingRingAudioCtxRef.current = ctx;
    }
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch {
      /* autoplay / policy */
    }
    if (ctx.state === "running") {
      incomingRingUnlockPromptShownRef.current = false;
      setIncomingCallRingShowUnlockButton(false);
      playIncomingRingPulse(ctx);
    }
  }, []);

  function shortPreview(v: string, max = 64) {
    const t = v.trim().replace(/\s+/g, " ");
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
  }

  function replyQuotePreview(line: string | undefined, max = 64): string {
    if (!line?.trim()) return "—";
    const trimmed = line.trim();
    const idx = trimmed.indexOf(": ");
    if (idx === -1) return shortPreview(trimmed, max);
    const lab = trimmed.slice(0, idx).trim();
    const body = trimmed.slice(idx + 2).trim();
    const labOut = lab.includes("@") ? "Пользователь" : lab;
    return shortPreview(`${labOut}: ${body}`.trim(), max);
  }

  function persistMessages(next: ChatMessage[]) {
    setMsgs(next);
    if (!listingId) return;
    const store = readStore();
    store[listingId] = next;
    writeStore(store);
  }

  const canDeleteForEveryoneOnServer = Boolean(auth.userId && currentSenderId === auth.userId);

  const registerOutboundMessage = useCallback(
    async (messageId: string, createdAt: number) => {
      if (!canDeleteForEveryoneOnServer || !chatId) return;
      try {
        await fetch("/api/chat/register-message", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, messageId, senderId: currentSenderId, createdAt }),
        });
      } catch {
        /* noop */
      }
    },
    [canDeleteForEveryoneOnServer, chatId, currentSenderId],
  );

  const refreshDeletions = useCallback(async () => {
    if (!listingId || !auth.userId || !chatId) return;
    try {
      const r = await fetch(`/api/chat/deletions?chatId=${encodeURIComponent(chatId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as {
        deletions?: Record<
          string,
          {
            deletedForEveryone?: boolean;
            deletedAt?: number;
            deletedByUserId?: string;
            deletedForUserIds?: string[];
          }
        >;
      };
      const rows = (j.deletions ?? {}) as Record<
        string,
        {
          deletedForEveryone?: boolean;
          deletedAt?: number;
          deletedByUserId?: string;
          deletedForUserIds?: string[];
        }
      >;
      const store = readStore();
      const raw = store[listingId] ?? [];
      const base = hydrateChatMessages(Array.isArray(raw) ? raw : [], listingId);
      const merged = mergeAllDeletions(base, rows);
      setMsgs(merged);
      store[listingId] = merged;
      writeStore(store);
    } catch {
      /* ignore */
    }
  }, [listingId, auth.userId, chatId]);

  const syncServerChat = useCallback(async () => {
    if (!listingId || !auth.userId || !chatId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const nowSync = Date.now();
    if (nowSync < syncChatBackoffUntilRef.current) return;
    if (syncChatFlightRef.current) return;
    syncChatFlightRef.current = true;
    try {
      const r = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        syncChatFailCountRef.current += 1;
        syncChatBackoffUntilRef.current = Date.now() + nextPollBackoffMs(syncChatFailCountRef.current);
        return;
      }
      syncChatFailCountRef.current = 0;
      syncChatBackoffUntilRef.current = 0;
      const j = (await r.json()) as { messages?: unknown };
      const raw = Array.isArray(j.messages) ? j.messages : [];
      const serverMsgs = raw
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((row) => serverRowToChatMessage(row, chatId));
      const store = readStore();
      const localRaw = store[listingId] ?? [];
      const localMsgs = hydrateChatMessages(Array.isArray(localRaw) ? localRaw : [], listingId);
      const merged = mergeChatLists(serverMsgs, localMsgs);
      const delR = await fetch(`/api/chat/deletions?chatId=${encodeURIComponent(chatId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      let final = merged;
      if (delR.ok) {
        const dj = (await delR.json()) as {
          deletions?: Record<
            string,
            {
              deletedForEveryone?: boolean;
              deletedAt?: number;
              deletedByUserId?: string;
              deletedForUserIds?: string[];
            }
          >;
        };
        final = mergeAllDeletions(merged, (dj.deletions ?? {}) as Record<string, MessageDeletionRow>);
      }
      setMsgs(final);
      store[listingId] = final;
      writeStore(store);

      const ownerTrim = listingOwnerId.trim();
      const buyerTrim = buyerIdResolved.trim();
      const canHydrateServer =
        !hydrateLocalToServerRef.current.has(chatId) &&
        raw.length === 0 &&
        final.length > 0 &&
        ownerTrim &&
        buyerTrim &&
        ownerTrim !== buyerTrim;
      if (canHydrateServer) {
        const listingTitleForSync =
          displayAd?.title?.trim() || (localListing as Listing | null)?.title?.trim() || "Объявление";
        const payload = final
          .filter((m) => !isEveryoneDeleted(m))
          .map((m) => ({
            id: m.id,
            senderId: m.senderId,
            ...(m.senderName?.trim() ? { senderName: m.senderName.trim() } : {}),
            createdAt: m.createdAt,
            type: m.type,
            ...(m.text !== undefined ? { text: m.text } : {}),
            ...(m.fileUrl ? { fileUrl: m.fileUrl } : {}),
            ...(m.fileName ? { fileName: m.fileName } : {}),
            ...(m.replyToMessageId ? { replyToMessageId: m.replyToMessageId } : {}),
            ...(m.replyToText ? { replyToText: m.replyToText } : {}),
            ...(m.editedAt ? { editedAt: m.editedAt } : {}),
          }));
        const syncRes = await fetch(`/api/chats/${encodeURIComponent(chatId)}/sync`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            listingTitle: listingTitleForSync,
            listingOwnerId: ownerTrim,
            buyerId: buyerTrim,
            messages: payload,
          }),
        });
        if (syncRes.ok) {
          hydrateLocalToServerRef.current.add(chatId);
        }
      }

      await fetch(`/api/chats/${encodeURIComponent(chatId)}/read`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("haliwali-chats-updated"));
      }
    } catch {
      syncChatFailCountRef.current += 1;
      syncChatBackoffUntilRef.current = Date.now() + nextPollBackoffMs(syncChatFailCountRef.current);
    } finally {
      syncChatFlightRef.current = false;
    }
  }, [listingId, auth.userId, chatId, listingOwnerId, buyerIdResolved, displayAd?.title, localListing]);

  async function executeMessageDeletion(scope: "me" | "everyone") {
    if (!deleteModal || deleteBusy) return;
    const messageId = deleteModal.messageId;
    const prev = msgs;
    if (scope === "everyone" && !canDeleteForEveryoneOnServer) return;

    const target = prev.find((m) => m.id === messageId);
    if (!target) return;
    if (scope === "everyone" && target.senderId !== currentSenderId) return;

    setDeleteBusy(true);
    try {
      const next =
        scope === "me"
          ? prev.map((mm) =>
              mm.id !== messageId
                ? mm
                : ({
                    ...mm,
                    deletedForUserIds: [
                      ...new Set([...(Array.isArray(mm.deletedForUserIds) ? mm.deletedForUserIds : []), currentSenderId]),
                    ],
                  } as ChatMessage),
            )
          : prev.map((mm) =>
              mm.id !== messageId
                ? mm
                : ({
                    ...mm,
                    deletedForEveryone: true,
                    deletedAt: Date.now(),
                    deletedByUserId: currentSenderId,
                    text: undefined,
                    fileUrl: undefined,
                    fileName: undefined,
                  } as ChatMessage),
            );
      persistMessages(next);

      let serverOk = true;
      const shouldHitServer =
        scope === "me" ? Boolean(auth.userId) : Boolean(canDeleteForEveryoneOnServer);
      if (!shouldHitServer && scope === "everyone") {
        serverOk = false;
      } else if (shouldHitServer) {
        const res = await fetch("/api/chat/message-delete", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, messageId, scope }),
        });
        serverOk = res.ok;
      }

      if (!serverOk) {
        persistMessages(prev);
      } else {
        await refreshDeletions();
      }
      setDeleteModal(null);
    } catch {
      persistMessages(prev);
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    if (!listingId || !auth.userId || !chatId) return;
    const tid = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void syncServerChat();
    }, 45000);
    return () => window.clearInterval(tid);
  }, [listingId, auth.userId, chatId, syncServerChat]);

  useEffect(() => {
    queueMicrotask(() => {
      void syncServerChat();
    });
  }, [syncServerChat]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      syncChatFailCountRef.current = 0;
      syncChatBackoffUntilRef.current = 0;
      loadPeersFailCountRef.current = 0;
      loadPeersBackoffUntilRef.current = 0;
      incomingPollFailCountRef.current = 0;
      incomingPollBackoffUntilRef.current = 0;
      void syncServerChat();
      void loadOwnerListingPeers();
    }
    function onOnline() {
      syncChatFailCountRef.current = 0;
      syncChatBackoffUntilRef.current = 0;
      loadPeersFailCountRef.current = 0;
      loadPeersBackoffUntilRef.current = 0;
      incomingPollFailCountRef.current = 0;
      incomingPollBackoffUntilRef.current = 0;
      void syncServerChat();
      void loadOwnerListingPeers();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [syncServerChat, loadOwnerListingPeers]);

  const visibleMsgs = useMemo(() => {
    return msgs.filter((m) => {
      const hid = Array.isArray(m.deletedForUserIds) ? m.deletedForUserIds : [];
      return !hid.includes(currentSenderId);
    });
  }, [msgs, currentSenderId]);

  const messageActionsTarget = useMemo(() => {
    if (!messageActionsTargetId) return null;
    return visibleMsgs.find((m) => m.id === messageActionsTargetId) ?? null;
  }, [messageActionsTargetId, visibleMsgs]);

  useEffect(() => {
    if (!messageActionsTargetId) return;
    if (!messageActionsTarget || isEveryoneDeleted(messageActionsTarget)) {
      queueMicrotask(() => setMessageActionsTargetId(null));
    }
  }, [messageActionsTarget, messageActionsTargetId]);

  useEffect(() => {
    if (!messageActionsTargetId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMessageActionsTargetId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [messageActionsTargetId]);

  useEffect(() => {
    if (!replyDraft) return;
    const t = msgs.find((m) => m.id === replyDraft.messageId);
    if (!t || isEveryoneDeleted(t)) queueMicrotask(() => setReplyDraft(null));
  }, [msgs, replyDraft]);

  useEffect(() => {
    if (!editDraft) return;
    const t = msgs.find((m) => m.id === editDraft.messageId);
    if (!t || isEveryoneDeleted(t) || t.senderId !== currentSenderId || t.type !== "text") {
      queueMicrotask(() => {
        setEditDraft(null);
        setText("");
      });
    }
  }, [msgs, editDraft, currentSenderId]);

  useEffect(() => {
    if (!replyDraft && !editDraft && !deleteModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (deleteModal && !deleteBusy) {
        setDeleteModal(null);
        return;
      }
      if (editDraft) setEditDraft(null);
      if (replyDraft) setReplyDraft(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editDraft, replyDraft, deleteModal, deleteBusy]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = emojiPickerWrapRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiPickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setEmojiPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiPickerOpen]);

  function insertEmojiAtCursor(emoji: string) {
    const el = inputRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      setText((prev) => prev.slice(0, start) + emoji + prev.slice(end));
      const pos = start + emoji.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return;
    }
    setText((prev) => prev + emoji);
    queueMicrotask(() => inputRef.current?.focus());
  }

  useEffect(() => {
    if (!outgoingRingOpen || !outgoingCallId) return;
    const cid = outgoingCallId;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (outgoingStatusFlightRef.current) return;
      outgoingStatusFlightRef.current = true;
      void (async () => {
        try {
          const r = await fetch(`/api/calls/status?callId=${encodeURIComponent(cid)}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!r.ok) return;
          const j = (await r.json()) as { ok?: boolean; call?: { status?: string } };
          const st = j.call?.status;
          if (st === "active") {
            setOutgoingRingOpen(false);
            setOutgoingCallId(null);
            setRtcPeerUserId(opponent.id.trim());
            {
              const hn = opponentLabel.trim();
              setRtcPeerHint(hn && !isPublicDisplayNameFallback(hn) ? hn : undefined);
            }
            setRtcCallId(cid);
            setRtcRole("caller");
            setRtcOpen(true);
          } else if (st === "declined") {
            setOutgoingRingOpen(false);
            setOutgoingCallId(null);
            setCallRejectedBanner(
              `${getPublicSenderName({
                userId: opponent.id.trim(),
                displayHint: opponentLabel.trim(),
                senderNameFromMessage: opponentLabel.trim(),
                emptyLabel: "Собеседник",
              })} отклонил звонок`,
            );
          } else if (st === "ended") {
            setOutgoingRingOpen(false);
            setOutgoingCallId(null);
          }
        } finally {
          outgoingStatusFlightRef.current = false;
        }
      })();
    };
    const tid = window.setInterval(tick, 650);
    return () => window.clearInterval(tid);
  }, [outgoingRingOpen, outgoingCallId, opponentLabel, opponent.id]);

  useEffect(() => {
    if (!mounted || !auth.userId || rtcOpen || outgoingRingOpen) return;
    const tid = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const nowInc = Date.now();
      if (nowInc < incomingPollBackoffUntilRef.current) return;
      if (incomingPollFlightRef.current) return;
      incomingPollFlightRef.current = true;
      void (async () => {
        try {
          const r = await fetch("/api/calls/incoming", { credentials: "include", cache: "no-store" });
          if (!r.ok) {
            incomingPollFailCountRef.current += 1;
            incomingPollBackoffUntilRef.current = Date.now() + nextPollBackoffMs(incomingPollFailCountRef.current);
            return;
          }
          incomingPollFailCountRef.current = 0;
          incomingPollBackoffUntilRef.current = 0;
          const j = (await r.json()) as {
            ok?: boolean;
            call: null | { callId: string; callerId: string; callerName: string };
          };
          if (!j.ok) {
            incomingPollFailCountRef.current += 1;
            incomingPollBackoffUntilRef.current = Date.now() + nextPollBackoffMs(incomingPollFailCountRef.current);
            return;
          }
          if (!j.call) {
            setIncomingCallInfo(null);
            return;
          }
          setIncomingCallInfo((prev) => {
            if (prev?.callId === j.call!.callId) return prev;
            return j.call!;
          });
        } catch {
          incomingPollFailCountRef.current += 1;
          incomingPollBackoffUntilRef.current = Date.now() + nextPollBackoffMs(incomingPollFailCountRef.current);
        } finally {
          incomingPollFlightRef.current = false;
        }
      })();
    }, 2000);
    return () => window.clearInterval(tid);
  }, [mounted, auth.userId, rtcOpen, outgoingRingOpen]);

  useEffect(() => {
    if (!callRejectedBanner) return;
    const t = window.setTimeout(() => setCallRejectedBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [callRejectedBanner]);

  useEffect(() => {
    if (!incomingCallInfo) return;

    incomingRingAwaitingGestureRef.current = false;
    incomingRingUnlockPromptShownRef.current = false;
    queueMicrotask(() => setIncomingCallRingShowUnlockButton(false));

    let cancelled = false;

    async function attemptIncomingRingBeep(): Promise<void> {
      if (cancelled) return;
      if (incomingRingAwaitingGestureRef.current) return;

      let ctx = incomingRingAudioCtxRef.current;
      if (!ctx) {
        ctx = createIncomingCallRingAudioContext();
        incomingRingAudioCtxRef.current = ctx;
      }
      if (!ctx) return;

      try {
        if (ctx.state === "suspended") await ctx.resume();
      } catch {
        incomingRingAwaitingGestureRef.current = true;
        if (!incomingRingUnlockPromptShownRef.current) {
          incomingRingUnlockPromptShownRef.current = true;
          setIncomingCallRingShowUnlockButton(true);
        }
        return;
      }

      if (ctx.state !== "running") {
        incomingRingAwaitingGestureRef.current = true;
        if (!incomingRingUnlockPromptShownRef.current) {
          incomingRingUnlockPromptShownRef.current = true;
          setIncomingCallRingShowUnlockButton(true);
        }
        return;
      }

      playIncomingRingPulse(ctx);
    }

    void attemptIncomingRingBeep();
    const interval = window.setInterval(() => {
      void attemptIncomingRingBeep();
    }, 2800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      incomingRingAwaitingGestureRef.current = false;
      incomingRingUnlockPromptShownRef.current = false;
      const c = incomingRingAudioCtxRef.current;
      incomingRingAudioCtxRef.current = null;
      try {
        void c?.close();
      } catch {
        /* noop */
      }
      queueMicrotask(() => setIncomingCallRingShowUnlockButton(false));
    };
  }, [incomingCallInfo?.callId]);

  async function uploadChatFile(file: File, conversationChatId: string): Promise<{ url: string }> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("chatId", conversationChatId);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_UPLOAD_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("/api/chat/upload", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: fd,
        signal: controller.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const aborted = isAbort || /abort/i.test(message);
      if (aborted) throw new Error(CHAT_UPLOAD_TIMEOUT_MESSAGE);
      throw new Error(CHAT_UPLOAD_FAIL_MESSAGE);
    } finally {
      window.clearTimeout(timeoutId);
    }
    const text = await res.text().catch(() => "");
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const errCode =
        data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
          ? String((data as { error: string }).error)
          : "";
      if (res.status === 403 && errCode === "USER_BLOCKED") {
        throw new Error(CHAT_USER_BLOCKED_MESSAGE);
      }
      throw new Error(CHAT_UPLOAD_FAIL_MESSAGE);
    }
    const url = typeof (data as { url?: unknown } | null)?.url === "string" ? String((data as { url: string }).url).trim() : "";
    if (!url) throw new Error(CHAT_UPLOAD_FAIL_MESSAGE);
    return { url };
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setFileError(null);
    if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
    setSelectedFilePreviewUrl(null);
  }

  useEffect(() => {
    if (!listingId) return;
    const store = readStore();
    const raw = store[listingId] ?? [];
    queueMicrotask(() => {
      setMsgs(hydrateChatMessages(Array.isArray(raw) ? raw : [], listingId));
      inputRef.current?.focus();
    });
  }, [listingId]);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    queueMicrotask(() => {
      setAdLoading(true);
      setAd(null);
      setAdNotFound(false);
    });
    fetch(`/api/ads/${encodeURIComponent(listingId)}`)
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 404) return { __notFound: true } as const;
          return null;
        }
        const data = (await r.json()) as unknown;
        const err = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
        if (typeof err === "string") {
          if (err === "NOT_FOUND") return { __notFound: true } as const;
          return null;
        }
        return data as {
          id: string;
          title: string;
          price?: number;
          city: string;
          category: string;
          images?: string[];
          ownerId?: string;
          authorPublicName?: string;
        };
      })
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "__notFound" in data) {
          setAd(null);
          setAdNotFound(true);
          return;
        }
        if (!data || typeof data !== "object") {
          setAd(null);
          return;
        }
        setAd(data);
      })
      .catch(() => {
        if (cancelled) return;
        setAd(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAdLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    // Cleanup preview URL on unmount.
    return () => {
      if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!listingId) {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className={chatPageShellOuterClass}>
          <div className={chatPageShellInnerClass}>
          <ReturnLink fallback="/" className="text-sm text-black/60 hover:text-black" />
          <div className="mt-4 rounded-3xl border border-black/10 bg-white p-6">
            <div className="text-lg font-semibold tracking-tight">Чат</div>
            <div className="mt-2 text-sm text-black/60">Не указан listingId.</div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-black/[0.03] text-black">
      <div className={chatPageShellOuterClass}>
        <div className={chatPageShellInnerClass}>
        <header className="shrink-0 py-3 md:py-4">
          <ReturnLink fallback="/" className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="flex min-h-0 flex-1 flex-col pb-0 md:pb-16">
          {adLoading ? (
            <div className="mb-4 cursor-default rounded-3xl border border-black/10 bg-white p-5">
              <div className="h-3 w-24 rounded bg-black/10" />
              <div className="mt-4 flex gap-4">
                <div className="h-[72px] w-[96px] shrink-0 rounded-2xl bg-black/10" />
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <div className="h-5 w-[70%] rounded bg-black/10" />
                  <div className="h-4 w-[45%] rounded bg-black/10" />
                  <div className="h-4 w-20 rounded bg-orange-200/60" />
                </div>
              </div>
            </div>
          ) : displayAd ? (
            <div className="mb-4 cursor-default rounded-3xl border border-black/10 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Объявление</div>
                  <div className="mt-3 flex gap-4">
                    {Array.isArray(displayAd.images) && displayAd.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayAd.images[0]}
                        alt=""
                        className="pointer-events-none h-[72px] w-[96px] shrink-0 select-none rounded-2xl border border-black/10 object-cover"
                      />
                    ) : (
                      <div className="grid h-[72px] w-[96px] shrink-0 place-items-center rounded-2xl border border-dashed border-black/12 bg-black/[0.02] text-[11px] font-medium text-black/40">
                        Нет фото
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={appendReturnUrlQuery(listingPath(displayAd.id, displayAd.title), chatSelfReturnHref)}
                        className="block cursor-pointer text-base font-semibold tracking-tight text-black hover:underline"
                      >
                        {displayAd.title}
                      </Link>
                      <div className="mt-1 text-sm text-black/50">
                        {displayAd.city} • {displayAd.category}
                      </div>
                      {typeof displayAd.price === "number" ? (
                        <div className="mt-2 text-sm font-semibold text-orange-600">
                          {Intl.NumberFormat("ru-RU").format(displayAd.price)} ₽
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {listingOwnerId ? (
                  <div className="flex w-full shrink-0 flex-col gap-2 border-t border-black/10 pt-3 sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right">
                    {listingOwnerAuthorLabel ? (
                      <div className="text-sm text-black/85">
                        Автор: <span className="font-semibold text-black">{listingOwnerAuthorLabel}</span>
                      </div>
                    ) : null}
                    <div className="text-xs text-black/55">{formatLastSeenRu(listingOwnerPublic?.lastSeenAt ?? null)}</div>
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {listingOwnerFastReplyEligible ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {FAST_REPLY_BADGE_LABEL}
                        </span>
                      ) : null}
                      {listingOwnerPublic?.phoneVerified ? (
                        <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          ✓ Подтверждён
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-2xl border border-black/15 bg-white px-3 text-sm font-medium text-black/70 hover:bg-black/5 sm:ml-auto sm:w-auto"
                      onClick={() => setReportOpen(true)}
                    >
                      Пожаловаться
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : adNotFound ? (
            <div className="mb-4 cursor-default rounded-3xl border border-black/10 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Объявление</div>
              <div className="mt-2 text-sm text-black/60">Объявление не найдено.</div>
            </div>
          ) : null}

          {showOwnerPeerPicker ? (
            <div className="mb-4 rounded-3xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold text-black/85">Выберите диалог</div>
              <div className="mt-1 text-sm text-black/55">По этому объявлению несколько переписок.</div>
              <div className="mt-4 grid gap-2">
                {ownerListingPeerOptions.map((row) => (
                  <button
                    key={row.conversationId}
                    type="button"
                    onClick={() => setOwnerPeerPick(row.otherUserId)}
                    className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3 text-left text-sm transition-colors hover:bg-black/[0.04]"
                  >
                    <div className="font-medium text-black/85">
                      {row.participantPublicName.trim() ||
                        displayNameForUserId(row.otherUserId)}
                    </div>
                    <div className="mt-1 line-clamp-2 text-black/55">{row.lastMessageText.trim() ? row.lastMessageText : "—"}</div>
                    <div className="mt-1 text-xs text-black/45">
                      {new Date(row.lastMessageAt).toLocaleString("ru-RU")}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-black/10 bg-white md:mb-0 md:min-h-[min(72dvh,640px)] md:max-h-[min(82dvh,760px)] md:flex-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
              <div className="text-lg font-semibold tracking-tight">Чат</div>
              <div className="flex shrink-0 items-center gap-2">
                {!chatIsBlocked ? (
                  <button
                    type="button"
                    onClick={() => void beginOutgoingCall()}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.03]"
                  >
                    Позвонить
                  </button>
                ) : null}
                {canManagePeerBlock ? (
                  <div className="relative" ref={chatMenuRef}>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-lg leading-none text-black/70 hover:bg-black/[0.03]"
                      aria-label="Меню чата"
                      aria-expanded={chatMenuOpen}
                      onClick={() => setChatMenuOpen((open) => !open)}
                    >
                      ⋯
                    </button>
                    {chatMenuOpen ? (
                      <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white py-1 shadow-lg">
                        {peerBlock.blockedByMe ? (
                          <button
                            type="button"
                            className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-black/80 hover:bg-black/[0.03] disabled:opacity-50"
                            disabled={blockBusy}
                            onClick={() => void unblockPeerUser()}
                          >
                            Разблокировать пользователя
                          </button>
                        ) : !peerBlock.blockedByMe ? (
                          <button
                            type="button"
                            className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-black/80 hover:bg-black/[0.03]"
                            onClick={() => {
                              setChatMenuOpen(false);
                              setBlockModalOpen(true);
                            }}
                          >
                            Заблокировать пользователя
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-2 sm:px-4 sm:py-3">
              <div className="mt-auto flex flex-col gap-2 pb-1">
              {visibleMsgs.length > 0 ? (
                visibleMsgs.map((m) => {
                  const isTom = isEveryoneDeleted(m);
                  const isOwn = m.senderId === currentSenderId;
                  return (
                    <div key={m.id} className={["flex w-full", isOwn ? "justify-end" : "justify-start"].join(" ")}>
                    <div
                      ref={(el) => {
                        msgRefs.current[m.id] = el;
                      }}
                      className={[
                        "group relative max-w-[min(88%,340px)] rounded-2xl border px-3 py-2.5 text-sm shadow-sm",
                        isTom
                          ? "border-black/[0.08] bg-black/[0.02]"
                          : isOwn
                            ? "border-orange-100 bg-orange-50/80"
                            : "border-black/10 bg-black/[0.03]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2 text-xs text-black/50">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-black/65">
                            {messageHeaderName(m)}
                          </span>
                          <span className="mx-2 text-black/25">·</span>
                          {formatChatMessageTime(m.createdAt)}
                          {isTom ? null : m.editedAt ? (
                            <span className="ml-2 text-[11px] text-black/45">изменено</span>
                          ) : null}
                        </div>
                        {!isTom ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-black/55 hover:bg-black/[0.05] md:hidden"
                              aria-label="Действия с сообщением"
                              onClick={() => setMessageActionsTargetId(m.id)}
                            >
                              ⋯
                            </button>
                            <div className="hidden shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[12px] text-black/55 hover:text-black"
                                onClick={() => {
                                  setEditDraft(null);
                                  setReplyDraft({
                                    messageId: m.id,
                                    senderLabel: messageHeaderName(m),
                                    text: m.type === "text" ? (m.text ?? "") : undefined,
                                    fileName: m.type === "file" ? (m.fileName ?? "Файл") : undefined,
                                  });
                                  inputRef.current?.focus();
                                }}
                              >
                                Ответить
                              </button>
                              {m.type === "text" && m.senderId && m.senderId === currentSenderId ? (
                                <button
                                  type="button"
                                  className="rounded px-1.5 py-0.5 text-[12px] text-black/55 hover:text-black"
                                  onClick={() => {
                                    setReplyDraft(null);
                                    setEditDraft({ messageId: m.id });
                                    setText((m.text ?? "").toString());
                                    inputRef.current?.focus();
                                  }}
                                >
                                  Редактировать
                                </button>
                              ) : null}
                              {m.senderId && m.senderId === currentSenderId ? (
                                <button
                                  type="button"
                                  className="rounded px-1.5 py-0.5 text-[12px] text-black/55 hover:text-black"
                                  onClick={() => setDeleteModal({ messageId: m.id })}
                                >
                                  Удалить
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>

                      {!isTom && m.replyToMessageId ? (
                        <button
                          type="button"
                          className="mt-2 w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-left text-xs text-black/60 hover:bg-white"
                          onClick={() => {
                            const el = msgRefs.current[m.replyToMessageId ?? ""];
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                          }}
                          title="Перейти к сообщению"
                        >
                          Ответ на:{" "}
                          <span className="text-black/70">
                            {m.replyToText ? replyQuotePreview(m.replyToText) : "—"}
                          </span>
                        </button>
                      ) : null}
                      {isTom ? (
                        <div className="mt-1 text-sm italic text-black/40">Сообщение удалено</div>
                      ) : m.type === "file" ? (
                        <div className="mt-1">
                          {m.fileUrl && isImageExt(m.fileName ?? "") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.fileUrl}
                              alt={m.fileName ?? "файл"}
                              className="max-w-full rounded-xl border border-black/10"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 bg-white/80">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-5 w-5 text-black/60"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <path d="M14 2v6h6" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-black/80">{m.fileName ?? "Файл"}</div>
                                {m.fileUrl ? (
                                  <a
                                    href={m.fileUrl}
                                    className="text-sm text-orange-700 hover:underline"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Скачать
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 text-black/80 whitespace-pre-wrap">{m.text}</div>
                      )}
                    </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-black/15 bg-white p-6 text-sm text-black/60">
                  Пока нет сообщений. Напишите первым.
                </div>
              )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 shrink-0 border-t border-black/10 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3 md:static md:z-auto">
            {chatIsBlocked ? (
              <div className="mb-1 flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/65">
                <span>Пользователь заблокирован</span>
                {peerBlock.blockedByMe ? (
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white px-2.5 text-xs font-semibold text-black/75 hover:bg-black/[0.03] disabled:opacity-50"
                    disabled={blockBusy}
                    onClick={() => void unblockPeerUser()}
                  >
                    Разблокировать
                  </button>
                ) : null}
              </div>
            ) : null}
            {!chatIsBlocked ? (
              <>
            {selectedFile ? (
              <div className="mb-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Вложение</div>
                    {selectedFilePreviewUrl && selectedFile.type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedFilePreviewUrl}
                        alt={selectedFile.name}
                        className="mt-2 max-h-[120px] w-auto rounded-xl border border-black/10 object-contain"
                      />
                    ) : null}
                    <div className="mt-2 truncate text-sm text-black/80">{selectedFile.name}</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
                    onClick={clearSelectedFile}
                    aria-label="Убрать вложение"
                    disabled={isUploading}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
            {fileError ? <div className="mb-2 text-sm text-red-600">{fileError}</div> : null}
            {sendError ? <div className="mb-2 text-sm text-red-600">{sendError}</div> : null}
            {callRejectedBanner ? (
              <div className="mb-2 text-sm text-black/70">{callRejectedBanner}</div>
            ) : null}

            {replyDraft ? (
              <div className="mb-3 rounded-2xl border border-black/10 bg-black/[0.02] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Ответ</div>
                    <div className="mt-1 truncate text-sm text-black/70">
                      Ответ на: {replyDraft.senderLabel}:{" "}
                      {replyDraft.fileName
                        ? replyDraft.fileName
                        : replyDraft.text
                          ? shortPreview(replyDraft.text)
                          : "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/[0.03]"
                    onClick={() => setReplyDraft(null)}
                    aria-label="Отменить ответ"
                    disabled={isUploading}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}

            {editDraft ? (
              <div className="mb-3 rounded-2xl border border-black/10 bg-black/[0.02] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-black/40">
                      Редактирование сообщения
                    </div>
                    <div className="mt-1 text-sm text-black/60">Нажмите «Сохранить» или Esc для отмены</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03]"
                    onClick={() => {
                      setEditDraft(null);
                      setText("");
                      inputRef.current?.focus();
                    }}
                    disabled={isUploading}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : null}

            <form
              className="flex w-full min-w-0 items-end gap-1.5 md:gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (isUploading || chatIsBlocked) return;
                void (async () => {
                  const senderId = currentSenderId;
                  const senderName = outboundSenderNameForApi;
                  const t = text.trim();

                  if (editDraft) {
                    if (!t) return;
                    const nowIso = new Date().toISOString();
                    const nextMsgs = msgs.map((mm) => {
                      if (mm.id !== editDraft.messageId) return mm;
                      if (isEveryoneDeleted(mm)) return mm;
                      // Only own text messages can be edited.
                      if (mm.type !== "text") return mm;
                      if (!mm.senderId || mm.senderId !== senderId) return mm;
                      return { ...mm, text: t, editedAt: nowIso } as ChatMessage;
                    });
                    persistMessages(nextMsgs);
                    setEditDraft(null);
                    setText("");
                    inputRef.current?.focus();
                    return;
                  }

                  setSendError(null);

                  if (chatIsBlocked) {
                    setSendError(CHAT_USER_BLOCKED_MESSAGE);
                    return;
                  }

                  if (!auth.userId) {
                    setSendError("Войдите, чтобы отправить сообщение.");
                    return;
                  }

                  if (!chatId) {
                    setSendError(
                      listingOwnerId && senderId === listingOwnerId
                        ? "Откройте чат из раздела «Сообщения» в кабинете или перейдите по чату с объявления."
                        : "Не удалось определить чат. Обновите страницу.",
                    );
                    return;
                  }

                  if (selectedFile) {
                    if (!selectedFile.name) return;
                    if (isUploading || chatFileUploadLockRef.current) return;
                    chatFileUploadLockRef.current = true;
                    setIsUploading(true);
                    try {
                      const uploaded = await uploadChatFile(selectedFile, chatId);
                      const sendController = new AbortController();
                      const sendTimeoutId = window.setTimeout(() => sendController.abort(), CHAT_SEND_FETCH_TIMEOUT_MS);
                      let res: Response;
                      try {
                        res = await fetch("/api/chats/send", {
                          method: "POST",
                          credentials: "include",
                          cache: "no-store",
                          headers: { "Content-Type": "application/json" },
                          signal: sendController.signal,
                          body: JSON.stringify({
                            listingId,
                            type: "file",
                            fileUrl: uploaded.url,
                            fileName: selectedFile.name,
                            text: "",
                            peerUserId: senderId === listingOwnerId ? buyerIdResolved : undefined,
                            senderName,
                            replyToMessageId: replyDraft?.messageId,
                            replyToText: replyDraft
                              ? `${replyDraft.senderLabel}: ${replyDraft.fileName ?? (replyDraft.text ?? "")}`.trim()
                              : undefined,
                          }),
                        });
                      } catch (sendErr) {
                        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
                        const isAbort =
                          (sendErr instanceof DOMException && sendErr.name === "AbortError") || /abort/i.test(msg);
                        throw new Error(isAbort ? CHAT_SEND_FILE_TIMEOUT_MESSAGE : CHAT_SEND_FILE_FAIL_MESSAGE);
                      } finally {
                        window.clearTimeout(sendTimeoutId);
                      }
                      const data = (await res.json().catch(() => ({}))) as {
                        ok?: boolean;
                        message?: Record<string, unknown>;
                        error?: string;
                      };
                      if (!res.ok || !data.ok || !data.message) {
                        if (data.error === "USER_BLOCKED") {
                          setFileError(CHAT_USER_BLOCKED_MESSAGE);
                          void refreshPeerBlockStatus();
                        } else {
                          setFileError(CHAT_SEND_FILE_FAIL_MESSAGE);
                        }
                        return;
                      }
                      const nextMsg = serverRowToChatMessage(data.message, chatId);
                      persistMessages([...msgs, nextMsg]);
                      void pingPresenceThrottled({ force: true });
                      void registerOutboundMessage(nextMsg.id, nextMsg.createdAt);
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("haliwali-chats-updated"));
                      }

                      setText("");
                      setReplyDraft(null);
                      clearSelectedFile();
                      inputRef.current?.focus();
                    } catch (err) {
                      console.error(err);
                      const msg =
                        err instanceof Error && err.message.trim() ? err.message.trim() : CHAT_UPLOAD_FAIL_MESSAGE;
                      setFileError(msg);
                    } finally {
                      chatFileUploadLockRef.current = false;
                      setIsUploading(false);
                    }
                    return;
                  }

                  if (!t) return;

                  const res = await fetch("/api/chats/send", {
                    method: "POST",
                    credentials: "include",
                    cache: "no-store",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      listingId,
                      text: t,
                      peerUserId: senderId === listingOwnerId ? buyerIdResolved : undefined,
                      senderName,
                      replyToMessageId: replyDraft?.messageId,
                      replyToText: replyDraft
                        ? `${replyDraft.senderLabel}: ${replyDraft.fileName ?? (replyDraft.text ?? "")}`.trim()
                        : undefined,
                    }),
                  });
                  const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    message?: Record<string, unknown>;
                    error?: string;
                  };
                  if (!res.ok || !data.ok || !data.message) {
                    if (data.error === "PEER_REQUIRED") {
                      setSendError("Откройте чат из раздела «Сообщения» в кабинете.");
                    } else if (data.error === "USER_BLOCKED") {
                      setSendError(CHAT_USER_BLOCKED_MESSAGE);
                      void refreshPeerBlockStatus();
                    } else {
                      setSendError("Не удалось отправить сообщение.");
                    }
                    return;
                  }
                  const nextMsg = serverRowToChatMessage(data.message, chatId);
                  persistMessages([...msgs, nextMsg]);
                  void pingPresenceThrottled({ force: true });
                  void registerOutboundMessage(nextMsg.id, nextMsg.createdAt);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("haliwali-chats-updated"));
                  }

                  setText("");
                  setReplyDraft(null);
                  inputRef.current?.focus();
                })();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp"
                disabled={composerDisabled}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) {
                    clearSelectedFile();
                    return;
                  }

                  const check = validateChatUploadClient(file);
                  if (!check.ok) {
                    setFileError(check.message);
                    if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
                    setSelectedFile(null);
                    setSelectedFilePreviewUrl(null);
                    return;
                  }

                  setFileError(null);
                  if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
                  setSelectedFile(file);
                  setSelectedFilePreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
                }}
              />
              <button
                type="button"
                className={chatComposerIconBtnClass}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Прикрепить файл"
                disabled={composerDisabled}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-8.49 8.49a5.25 5.25 0 01-7.43-7.43l9.19-9.19a3.5 3.5 0 014.95 4.95l-8.49 8.49a1.75 1.75 0 01-2.47-2.47l8.24-8.24" />
                </svg>
              </button>
              <div className="relative shrink-0" ref={emojiPickerWrapRef}>
                <button
                  type="button"
                  className={chatComposerIconBtnClass}
                  onClick={() => setEmojiPickerOpen((o) => !o)}
                  aria-label="Смайлы"
                  aria-expanded={emojiPickerOpen}
                  disabled={composerDisabled}
                >
                  <span aria-hidden>🙂</span>
                </button>
                {emojiPickerOpen ? (
                  <div
                    className="absolute bottom-full left-0 z-[60] mb-1.5 w-[min(100vw-2rem,220px)] rounded-xl border border-black/10 bg-white p-2 shadow-lg"
                    role="listbox"
                    aria-label="Выбор смайла"
                  >
                    <div className="grid grid-cols-7 gap-0.5">
                      {CHAT_QUICK_EMOJIS.map((emo) => (
                        <button
                          key={emo}
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-lg leading-none hover:bg-black/[0.06]"
                          onClick={() => insertEmojiAtCursor(emo)}
                          aria-label={emo}
                        >
                          {emo}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <textarea
                  ref={inputRef}
                  value={text}
                  rows={1}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Сообщение..."
                  className="max-h-28 min-h-10 w-full min-w-0 resize-none rounded-2xl border border-black/10 bg-white px-3 py-2 text-base leading-snug outline-none placeholder:text-ellipsis focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)] disabled:cursor-not-allowed disabled:bg-black/[0.02] disabled:text-black/45 sm:px-4 sm:py-2.5 sm:text-sm md:min-h-11"
                  disabled={composerDisabled}
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-base text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:w-auto md:rounded-2xl md:px-5 md:text-sm md:font-semibold"
                disabled={composerDisabled}
                aria-label="Отправить"
              >
                <span className="sm:hidden" aria-hidden>
                  ➤
                </span>
                <span className="hidden sm:inline">{isUploading ? "Загрузка…" : "Отправить"}</span>
              </button>
            </form>
              </>
            ) : null}

            {messageActionsTarget && !isEveryoneDeleted(messageActionsTarget) ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 bg-black/35 md:hidden"
                  aria-label="Закрыть меню"
                  onClick={() => setMessageActionsTargetId(null)}
                />
                <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-black/10 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:hidden">
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15" />
                  <div className="grid gap-2">
                    <button
                      type="button"
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-white text-sm font-semibold text-black/80"
                      onClick={() => {
                        setEditDraft(null);
                        setReplyDraft({
                          messageId: messageActionsTarget.id,
                          senderLabel: messageHeaderName(messageActionsTarget),
                          text: messageActionsTarget.type === "text" ? (messageActionsTarget.text ?? "") : undefined,
                          fileName:
                            messageActionsTarget.type === "file" ? (messageActionsTarget.fileName ?? "Файл") : undefined,
                        });
                        setMessageActionsTargetId(null);
                        inputRef.current?.focus();
                      }}
                    >
                      Ответить
                    </button>
                    {messageActionsTarget.type === "text" &&
                    messageActionsTarget.senderId &&
                    messageActionsTarget.senderId === currentSenderId ? (
                      <button
                        type="button"
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-white text-sm font-semibold text-black/80"
                        onClick={() => {
                          setReplyDraft(null);
                          setEditDraft({ messageId: messageActionsTarget.id });
                          setText((messageActionsTarget.text ?? "").toString());
                          setMessageActionsTargetId(null);
                          inputRef.current?.focus();
                        }}
                      >
                        Редактировать
                      </button>
                    ) : null}
                    {messageActionsTarget.senderId && messageActionsTarget.senderId === currentSenderId ? (
                      <button
                        type="button"
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700"
                        onClick={() => {
                          setDeleteModal({ messageId: messageActionsTarget.id });
                          setMessageActionsTargetId(null);
                        }}
                      >
                        Удалить
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-black/[0.03] text-sm font-semibold text-black/70"
                      onClick={() => setMessageActionsTargetId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            </div>
          </div>

          {outgoingRingOpen ? (
            <div
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="outgoing-call-title"
            >
              <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-xl">
                <h2 id="outgoing-call-title" className="text-lg font-semibold tracking-tight">
                  Звоним пользователю…
                </h2>
                {opponent.id.trim() ? (
                  <p className="mt-2 text-sm text-black/60">
                    {getPublicSenderName({
                      userId: opponent.id,
                      senderNameFromMessage: opponentLabel,
                      displayHint: opponentLabel,
                      emptyLabel: "Собеседник",
                    })}
                  </p>
                ) : null}
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => void cancelOutgoingCall()}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/[0.03]"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {incomingCallInfo && !rtcOpen ? (
            <div
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="incoming-call-title"
            >
              <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-xl">
                <h2 id="incoming-call-title" className="text-lg font-semibold tracking-tight">
                  Входящий вызов
                </h2>
                <p className="mt-2 text-sm text-black/65">
                  {getPublicSenderName({
                    userId: incomingCallInfo.callerId,
                    senderNameFromMessage: incomingCallInfo.callerName,
                    displayHint: incomingCallInfo.callerName,
                    emptyLabel: PUBLIC_DISPLAY_NAME_FALLBACK,
                  })}{" "}
                  звонит вам
                </p>
                {incomingCallRingShowUnlockButton ? (
                  <div className="mt-4 rounded-2xl border border-amber-200/90 bg-amber-50/95 p-3">
                    <p className="text-sm font-medium leading-snug text-amber-950/90">
                      Звук звонка может быть отключён браузером (часто на iPhone или во встроенном браузере).
                      Нажмите кнопку ниже после вашего действия — звонок остаётся на экране.
                    </p>
                    <button
                      type="button"
                      onClick={() => void unlockIncomingCallRingSound()}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-amber-300/80 bg-white px-4 text-sm font-semibold text-amber-950/95 hover:bg-amber-50"
                    >
                      Включить звук звонка
                    </button>
                  </div>
                ) : null}
                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void acceptIncomingCall()}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    onClick={() => void declineIncomingCall()}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/[0.03]"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <WebRtcCallModal
            open={rtcOpen}
            callId={rtcCallId ?? ""}
            role={rtcRole}
            peerUserId={rtcPeerUserId}
            peerDisplayHint={rtcPeerHint}
            onClose={endRtcCall}
          />
          <BlockPeerModal
            open={blockModalOpen}
            busy={blockBusy}
            onClose={() => {
              if (!blockBusy) setBlockModalOpen(false);
            }}
            onConfirm={() => void blockPeerUser()}
          />
          <DeleteMessageModal
            open={Boolean(deleteModal)}
            busy={deleteBusy}
            canDeleteForEveryone={canDeleteForEveryoneOnServer}
            onClose={() => {
              if (!deleteBusy) setDeleteModal(null);
            }}
            onDeleteOnlyMe={() => void executeMessageDeletion("me")}
            onDeleteEveryone={() => void executeMessageDeletion("everyone")}
          />
          <ReportModal
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            targetType="listing"
            targetId={listingId}
          />
        </main>
        </div>
      </div>
    </div>
  );
}

function BlockPeerModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[94] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-peer-title"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-xl">
        <h2 id="block-peer-title" className="text-lg font-semibold tracking-tight">
          Заблокировать пользователя?
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Вы больше не сможете обмениваться сообщениями и звонками с этим пользователем.
        </p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Заблокировать
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/70 hover:bg-black/5"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteMessageModal({
  open,
  busy,
  canDeleteForEveryone,
  onClose,
  onDeleteOnlyMe,
  onDeleteEveryone,
}: {
  open: boolean;
  busy: boolean;
  canDeleteForEveryone: boolean;
  onClose: () => void;
  onDeleteOnlyMe: () => void;
  onDeleteEveryone: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[94] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-msg-title"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-xl">
        <h2 id="delete-msg-title" className="text-lg font-semibold tracking-tight">
          Удалить сообщение?
        </h2>
        <p className="mt-2 text-sm text-black/60">Выберите, как удалить сообщение.</p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDeleteOnlyMe}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Удалить только у меня
          </button>
          <button
            type="button"
            disabled={busy || !canDeleteForEveryone}
            onClick={onDeleteEveryone}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
            title={canDeleteForEveryone ? undefined : "Войдите в аккаунт, чтобы удалить у всех"}
          >
            Удалить у всех
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/70 hover:bg-black/5"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
