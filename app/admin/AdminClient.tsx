"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PasswordChangeModal } from "../components/PasswordChangeModal";
import {
  getPublicUserName,
  looksLikeTechnicalUserId,
  PUBLIC_DISPLAY_NAME_FALLBACK,
  type PublicUserLookupRow,
} from "../lib/getPublicUserName";
import { getUserDisplayName } from "../lib/userDisplayName";
import { listingDealStatusBadgeRu } from "../lib/listingCardMeta";
import type { Listing, ListingStatus } from "../lib/listings";
import { useListingsStore } from "../lib/listings";
import { inferredSupportSenderType, supportMessageLabelAdminPanel } from "../lib/supportUiLabels";

const statusLabel: Record<ListingStatus, string> = {
  pending: "На проверке",
  auto: "Опубликовано",
  approved: "Опубликовано",
  rejected: "Отклонено",
};

function Badge({ status }: { status: ListingStatus }) {
  const cls =
    status === "auto" || status === "approved"
      ? "border-green-200 bg-green-50 text-green-700"
      : status === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-yellow-200 bg-yellow-50 text-yellow-800";
  return (
    <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls].join(" ")}>
      {statusLabel[status]}
    </span>
  );
}

function ListingCard({
  listing,
  ownerLabel,
  onPublish,
  onReject,
  onDelete,
}: {
  listing: Listing;
  ownerLabel?: string;
  onPublish: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const requestDelete = () => {
    if (!confirm("Удалить объявление?")) return;
    onDelete();
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold tracking-tight">{listing.title}</div>
            <Badge status={listing.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-black/60">
            <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-black/70">
              {listingDealStatusBadgeRu(listing)}
            </span>
            <span>•</span>
            <span>{listing.categoryName}</span>
            <span>•</span>
            <span>{listing.city}</span>
          </div>
          <div className="mt-1 text-xs text-black/55">
            Автор: <span className="text-black/75">{(ownerLabel ?? "").trim() || PUBLIC_DISPLAY_NAME_FALLBACK}</span>
          </div>
          {"specialization" in listing ? (
            <div className="mt-2 text-sm text-black/70">{listing.specialization}</div>
          ) : null}
          {"price" in listing ? (
            <div className="mt-2 text-sm text-black/70">
              Цена: {Intl.NumberFormat("ru-RU").format(listing.price)} ₽
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-black/70 whitespace-pre-wrap">
        {listing.description}
      </div>

      {listing.status === "pending" ? (
        <div className="mt-3 text-sm text-black/60">
          Причина модерации:{" "}
          <span className="text-black/70">{listing.moderationReason || "—"}</span>
        </div>
      ) : listing.status === "rejected" && listing.moderationReason ? (
        <div className="mt-3 text-sm text-black/60">
          Причина отклонения: <span className="text-black/70">{listing.moderationReason}</span>
        </div>
      ) : null}

      {listing.photos.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {listing.photos.map((src, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${listing.id}-${idx}`}
              src={src}
              alt=""
              className="h-20 w-20 rounded-2xl border border-black/10 object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {listing.status === "pending" ? (
          <>
            <button
              type="button"
              onClick={onPublish}
              className="h-10 rounded-2xl px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
              style={{ backgroundColor: "#ff7a00" }}
            >
              Опубликовать
            </button>
            <button
              type="button"
              onClick={onReject}
              className="h-10 rounded-2xl border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
            >
              Отклонить
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={requestDelete}
          className="h-10 rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

type AdminTab = "pending" | "published" | "rejected" | "reports" | "support" | "users";

const supportCategoryRu: Record<string, string> = {
  listing_problem: "Проблема с объявлением",
  user_report: "Жалоба на пользователя",
  question: "Вопрос",
  other: "Другое",
  feedback: "Обратная связь",
};

const supportStatusRu: Record<string, string> = {
  open: "Открыто",
  in_progress: "В работе",
  closed: "Закрыто",
};

type SupportTicketListRow = {
  id: string;
  userId: string;
  /** `public_feedback` — форма на сайте; иначе обращение из аккаунта. */
  source?: string;
  userLabel?: string;
  category: string;
  status: string;
  updatedAt: number;
  createdAt: number;
  preview: string;
  messageCount: number;
  listingId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type SupportTicketMessageRow = { id: string; role: string; senderType?: string; text: string; createdAt: number };

const adminReportActionBtn =
  "inline-flex h-8 max-w-full items-center justify-center whitespace-nowrap rounded-lg border border-black/15 bg-white px-2 text-xs font-semibold text-black hover:bg-black/5";
const adminReportDangerBtn =
  "inline-flex h-8 max-w-full items-center justify-center whitespace-nowrap rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 hover:bg-red-50";

const userStatusRu: Record<string, string> = {
  active: "Активен",
  pending_deletion: "Ожидает удаления",
  blocked: "Заблокирован",
  deleted: "Удалён",
};

type AdminUserRow = {
  id: string;
  loginOrEmail: string;
  displayName: string;
  /** StoredUser.name (`full_name` / JSON) — trimmed; empty if unset. */
  profileName: string;
  /** StoredUser.displayName (`public_display_name` / JSON); empty if unset. */
  chosenDisplayName: string;
  reporterLabel: string;
  createdAt: number;
  status: string;
  moderationBlocked: boolean;
  deletionStatus: string;
  deleteRequestedAt?: number;
  deleteScheduledAt?: number;
  listingsCount: number;
  activeListingsCount: number;
  reportsCount: number;
};

/** «Имя» column / detail — единое правило с остальным приложением. */
function adminUsersTableResolvedName(
  row: Pick<AdminUserRow, "loginOrEmail" | "profileName" | "chosenDisplayName">,
): string {
  const lo = row.loginOrEmail.trim();
  return getUserDisplayName(
    {
      email: lo.includes("@") ? lo : undefined,
      loginOrEmail: lo.includes("@") ? lo : lo || undefined,
    },
    { name: row.profileName, displayName: row.chosenDisplayName },
    { allowEmailFallback: false },
  );
}

type ComplaintDeletedPreview = {
  deletedAt: number;
  title: string;
  category: string;
  type: string;
  city: string;
  preview: string;
};

type AdminReportRow = {
  id: string;
  reporterId: string;
  reporterDisplay?: string;
  targetType: string;
  targetId: string;
  targetDisplay?: string;
  reason: string;
  comment: string;
  createdAt: number;
  listingId?: string;
  listingTitle?: string;
  targetUserId?: string;
  listingSoftDeleted?: boolean;
  complaintDeletedPreview?: ComplaintDeletedPreview;
};

type AdminUserDetail = {
  id: string;
  loginOrEmail: string;
  displayName: string;
  profileName: string;
  chosenDisplayName: string;
  reporterLabel: string;
  createdAt: number;
  lastSeenAt?: number;
  phoneVisible: boolean;
  deletionStatus: string;
  deleteRequestedAt?: number;
  deleteScheduledAt?: number;
  status: string;
  moderationBlocked: boolean;
  moderationBlockedAt?: number;
  listingsCount: number;
  reportsCount: number;
  listings: Array<{
    id: string;
    title: string;
    status: string;
    dealStatus: string;
    city: string;
    createdAt: number;
  }>;
};

function Tabs({
  value,
  onChange,
  counts,
}: {
  value: AdminTab;
  onChange: (v: AdminTab) => void;
  counts: {
    pending: number;
    published: number;
    rejected: number;
    reports: number;
    support: number;
    users: number;
  };
}) {
  const tabs: Array<{ key: AdminTab; label: string; counter?: number }> = [
    { key: "pending", label: "На проверке" },
    { key: "published", label: "Опубликованные" },
    { key: "rejected", label: "Отклонённые" },
    { key: "reports", label: "Жалобы", counter: counts.reports },
    { key: "support", label: "Обращения", counter: counts.support },
    { key: "users", label: "Пользователи", counter: counts.users },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              "h-10 rounded-2xl border px-4 text-sm font-semibold transition-colors",
              active ? "border-black/15 bg-black/5 text-black" : "border-black/10 bg-white text-black/70 hover:bg-black/5",
            ].join(" ")}
          >
            {t.label}{" "}
            {t.key === "reports" ? (
              <span className="text-black/50">({t.counter ?? 0})</span>
            ) : t.key === "users" ? (
              <span className="text-black/50">({t.counter ?? 0})</span>
            ) : t.key === "support" ? (
              <span className="text-black/50">({t.counter ?? 0})</span>
            ) : t.key === "pending" ? (
              <span className="text-black/50">({counts.pending})</span>
            ) : t.key === "published" ? (
              <span className="text-black/50">({counts.published})</span>
            ) : (
              <span className="text-black/50">({counts.rejected})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminClient() {
  const { loaded, listings, setStatus, deleteListing, refreshListings } = useListingsStore();
  const [tab, setTab] = useState<AdminTab>("pending");
  const [reportsReload, setReportsReload] = useState(0);
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [supportRows, setSupportRows] = useState<SupportTicketListRow[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportTicketId, setSupportTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportTicketMessageRow[]>([]);
  const [supportDeleteError, setSupportDeleteError] = useState<string | null>(null);
  const [supportMeta, setSupportMeta] = useState<{
    userId: string;
    userDisplayName: string;
    source?: string;
    category: string;
    status: string;
    listingId?: string;
    listingTitle?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  } | null>(null);
  const [supportDetailLoading, setSupportDetailLoading] = useState(false);
  const [supportReply, setSupportReply] = useState("");
  const [supportReplyBusy, setSupportReplyBusy] = useState(false);

  /** Счётчики вкладок: не привязаны к активной вкладке; обновляются при загрузке и после действий. */
  const [counts, setCounts] = useState({
    pending: 0,
    published: 0,
    rejected: 0,
    reports: 0,
    support: 0,
    users: 0,
  });

  const sorted = useMemo(() => {
    return [...listings].sort((a, b) => b.createdAt - a.createdAt);
  }, [listings]);

  useEffect(() => {
    if (!loaded) return;
    let pending = 0;
    let published = 0;
    let rejected = 0;
    for (const l of listings) {
      if (l.status === "pending") pending += 1;
      else if (l.status === "rejected") rejected += 1;
      else if (l.status === "auto" || l.status === "approved") published += 1;
    }
    setCounts((c) => ({ ...c, pending, published, rejected }));
  }, [loaded, listings]);

  const ownerLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of adminUsers) {
      const label = adminUsersTableResolvedName(u);
      if (label && u.id) m.set(u.id, label);
    }
    return m;
  }, [adminUsers]);

  const publicUserLookupRows = useMemo((): PublicUserLookupRow[] => {
    return adminUsers.map((u) => ({
      id: u.id,
      userId: u.id,
      reporterLabel: u.reporterLabel,
      loginOrEmail: u.loginOrEmail,
      ...(u.profileName ? { profileName: u.profileName } : {}),
      ...(u.chosenDisplayName ? { chosenDisplayName: u.chosenDisplayName } : {}),
      ...(u.loginOrEmail.includes("@") ? { email: u.loginOrEmail } : {}),
    }));
  }, [adminUsers]);

  const resolveComplaintUserLabel = useCallback(
    (userId: string, apiHint?: string) => {
      const id = userId.trim();
      if (!id) return PUBLIC_DISPLAY_NAME_FALLBACK;
      const primary = getPublicUserName(id, publicUserLookupRows);
      if (primary !== PUBLIC_DISPLAY_NAME_FALLBACK) return primary;
      const api = (apiHint ?? "").trim();
      if (api && api !== id && !looksLikeTechnicalUserId(api))
        return getPublicUserName({
          ...(/@/.test(api) ? { email: api } : { displayName: api }),
        });
      return primary;
    },
    [publicUserLookupRows],
  );

  const resolveReportReporterDisplay = useCallback(
    (r: { reporterId: string; reporterDisplay?: string }) =>
      resolveComplaintUserLabel(r.reporterId, r.reporterDisplay),
    [resolveComplaintUserLabel],
  );

  const resolveSupportUserLabel = useCallback(
    (userIdRaw: string, apiLabelRaw?: string) => {
      const id = userIdRaw.trim();
      const primary = getPublicUserName(id, publicUserLookupRows);
      if (primary !== PUBLIC_DISPLAY_NAME_FALLBACK) return primary;
      const api = (apiLabelRaw ?? "").trim();
      if (api && api !== id && !looksLikeTechnicalUserId(api))
        return getPublicUserName({
          ...(/@/.test(api) ? { email: api } : { displayName: api }),
        });
      return primary;
    },
    [publicUserLookupRows],
  );

  const filtered = useMemo(() => {
    if (tab === "pending") return sorted.filter((l) => l.status === "pending");
    if (tab === "rejected") return sorted.filter((l) => l.status === "rejected");
    if (tab === "published") return sorted.filter((l) => l.status === "auto" || l.status === "approved");
    if (tab === "support" || tab === "users" || tab === "reports") return [];
    return [];
  }, [sorted, tab]);

  const bumpReports = useCallback(() => setReportsReload((n) => n + 1), []);

  const refreshUsers = useCallback(() => {
    setUsersLoading(true);
    void fetch("/api/admin/users", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d !== "object") return;
        const itemsRaw = (d as { users?: unknown }).users;
        const items: unknown[] = Array.isArray(itemsRaw)
          ? itemsRaw
          : itemsRaw && typeof itemsRaw === "object"
            ? Object.values(itemsRaw as Record<string, unknown>)
            : [];
        const cleaned: AdminUserRow[] = [];
        for (const x of items) {
          if (!x || typeof x !== "object") continue;
          const o = x as Record<string, unknown>;
          if (
            typeof o.id === "string" &&
            typeof o.loginOrEmail === "string" &&
            typeof o.displayName === "string" &&
            typeof o.reporterLabel === "string" &&
            typeof o.createdAt === "number" &&
            typeof o.status === "string" &&
            typeof o.moderationBlocked === "boolean" &&
            typeof o.deletionStatus === "string" &&
            typeof o.listingsCount === "number" &&
            typeof o.activeListingsCount === "number" &&
            typeof o.reportsCount === "number"
          ) {
            cleaned.push({
              id: o.id,
              loginOrEmail: o.loginOrEmail,
              displayName: o.displayName,
              profileName: typeof o.profileName === "string" ? o.profileName.trim() : "",
              chosenDisplayName: typeof o.chosenDisplayName === "string" ? o.chosenDisplayName.trim() : "",
              reporterLabel: o.reporterLabel,
              createdAt: o.createdAt,
              status: o.status,
              moderationBlocked: o.moderationBlocked,
              deletionStatus: o.deletionStatus,
              deleteRequestedAt: typeof o.deleteRequestedAt === "number" ? o.deleteRequestedAt : undefined,
              deleteScheduledAt: typeof o.deleteScheduledAt === "number" ? o.deleteScheduledAt : undefined,
              listingsCount: o.listingsCount,
              activeListingsCount: o.activeListingsCount,
              reportsCount: o.reportsCount,
            });
          }
        }
        setAdminUsers(cleaned);
        setCounts((c) => ({ ...c, users: cleaned.length }));
      })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

  const bumpUserDetail = useCallback((userId: string) => {
    setDetailUserId((cur) => {
      if (cur !== userId) return cur;
      queueMicrotask(() => setDetailUserId(userId));
      return null;
    });
  }, []);

  const refreshSupport = useCallback(() => {
    setSupportLoading(true);
    setSupportDeleteError(null);
    void fetch("/api/support/list", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d !== "object") return;
        const items = (d as { tickets?: unknown }).tickets;
        if (!Array.isArray(items)) return;
        const cleaned: SupportTicketListRow[] = [];
        for (const x of items) {
          if (!x || typeof x !== "object") continue;
          const o = x as Record<string, unknown>;
          if (
            typeof o.id === "string" &&
            typeof o.userId === "string" &&
            typeof o.category === "string" &&
            typeof o.status === "string" &&
            typeof o.updatedAt === "number" &&
            typeof o.createdAt === "number" &&
            typeof o.preview === "string" &&
            typeof o.messageCount === "number"
          ) {
            cleaned.push({
              id: o.id,
              userId: o.userId,
              ...(typeof o.source === "string" && o.source.trim() ? { source: o.source.trim() } : {}),
              ...(typeof o.userLabel === "string" ? { userLabel: o.userLabel } : {}),
              category: o.category,
              status: o.status,
              updatedAt: o.updatedAt,
              createdAt: o.createdAt,
              preview: o.preview,
              messageCount: o.messageCount,
              ...(typeof o.listingId === "string" && o.listingId.trim() ? { listingId: o.listingId.trim() } : {}),
              ...(typeof o.contactName === "string" && o.contactName.trim() ? { contactName: o.contactName.trim() } : {}),
              ...(typeof o.contactEmail === "string" && o.contactEmail.trim() ? { contactEmail: o.contactEmail.trim() } : {}),
              ...(typeof o.contactPhone === "string" && o.contactPhone.trim() ? { contactPhone: o.contactPhone.trim() } : {}),
            });
          }
        }
        setSupportRows(cleaned);
        setCounts((c) => ({ ...c, support: cleaned.length }));
      })
      .catch(() => {})
      .finally(() => setSupportLoading(false));
  }, []);

  const loadSupportTicket = useCallback((id: string) => {
    setSupportDetailLoading(true);
    void fetch(`/api/support/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d !== "object") return;
        const t = (d as { ticket?: unknown }).ticket;
        if (!t || typeof t !== "object") return;
        const o = t as Record<string, unknown>;
        const msgsRaw = o.messages;
        const messages: SupportTicketMessageRow[] = [];
        if (Array.isArray(msgsRaw)) {
          for (const m of msgsRaw) {
            if (!m || typeof m !== "object") continue;
            const M = m as Record<string, unknown>;
            if (
              typeof M.id === "string" &&
              typeof M.role === "string" &&
              typeof M.text === "string" &&
              typeof M.createdAt === "number"
            ) {
              messages.push({
                id: M.id,
                role: M.role,
                ...(typeof M.senderType === "string" && M.senderType.trim() ? { senderType: M.senderType.trim() } : {}),
                text: M.text,
                createdAt: M.createdAt,
              });
            }
          }
        }
        if (typeof o.userId === "string" && typeof o.category === "string" && typeof o.status === "string") {
          const udn = typeof o.userDisplayName === "string" ? o.userDisplayName : "";
          setSupportMeta({
            userId: o.userId,
            userDisplayName: udn.trim() || getPublicUserName(null),
            ...(typeof o.source === "string" && o.source.trim() ? { source: o.source.trim() } : {}),
            category: o.category,
            status: o.status,
            ...(typeof o.listingId === "string" && o.listingId.trim() ? { listingId: o.listingId.trim() } : {}),
            ...(typeof o.listingTitle === "string" && o.listingTitle.trim() ? { listingTitle: o.listingTitle.trim() } : {}),
            ...(typeof o.contactName === "string" && o.contactName.trim() ? { contactName: o.contactName.trim() } : {}),
            ...(typeof o.contactEmail === "string" && o.contactEmail.trim() ? { contactEmail: o.contactEmail.trim() } : {}),
            ...(typeof o.contactPhone === "string" && o.contactPhone.trim() ? { contactPhone: o.contactPhone.trim() } : {}),
          });
          setSupportMessages(messages);
        }
      })
      .catch(() => {})
      .finally(() => setSupportDetailLoading(false));
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (!loaded) return;
    refreshSupport();
  }, [loaded, refreshSupport]);

  useEffect(() => {
    if (!loaded || tab !== "support") return;
    refreshSupport();
  }, [loaded, tab, refreshSupport]);

  useEffect(() => {
    if (!loaded || tab !== "users") return;
    refreshUsers();
  }, [loaded, tab, refreshUsers]);

  useEffect(() => {
    if (!supportTicketId) {
      setSupportMessages([]);
      setSupportMeta(null);
      return;
    }
    loadSupportTicket(supportTicketId);
  }, [supportTicketId, loadSupportTicket]);

  useEffect(() => {
    if (!detailUserId) {
      setUserDetail(null);
      return;
    }
    let cancelled = false;
    setUserDetailLoading(true);
    void fetch(`/api/admin/users/${encodeURIComponent(detailUserId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const u = (d as { user?: unknown }).user;
        if (!u || typeof u !== "object") return;
        const o = u as Record<string, unknown>;
        const listingsRaw = o.listings;
        const listings: AdminUserDetail["listings"] = [];
        if (Array.isArray(listingsRaw)) {
          for (const item of listingsRaw) {
            if (!item || typeof item !== "object") continue;
            const L = item as Record<string, unknown>;
            if (
              typeof L.id === "string" &&
              typeof L.title === "string" &&
              typeof L.status === "string" &&
              typeof L.dealStatus === "string" &&
              typeof L.city === "string" &&
              typeof L.createdAt === "number"
            ) {
              listings.push({
                id: L.id,
                title: L.title,
                status: L.status,
                dealStatus: L.dealStatus,
                city: L.city,
                createdAt: L.createdAt,
              });
            }
          }
        }
        if (
          typeof o.id === "string" &&
          typeof o.loginOrEmail === "string" &&
          typeof o.displayName === "string" &&
          typeof o.reporterLabel === "string" &&
          typeof o.createdAt === "number" &&
          typeof o.phoneVisible === "boolean" &&
          typeof o.deletionStatus === "string" &&
          typeof o.status === "string" &&
          typeof o.moderationBlocked === "boolean" &&
          typeof o.listingsCount === "number" &&
          typeof o.reportsCount === "number"
        ) {
          setUserDetail({
            id: o.id,
            loginOrEmail: o.loginOrEmail,
            displayName: o.displayName,
            profileName: typeof o.profileName === "string" ? o.profileName.trim() : "",
            chosenDisplayName: typeof o.chosenDisplayName === "string" ? o.chosenDisplayName.trim() : "",
            reporterLabel: o.reporterLabel,
            createdAt: o.createdAt,
            lastSeenAt: typeof o.lastSeenAt === "number" ? o.lastSeenAt : undefined,
            phoneVisible: o.phoneVisible,
            deletionStatus: o.deletionStatus,
            deleteRequestedAt: typeof o.deleteRequestedAt === "number" ? o.deleteRequestedAt : undefined,
            deleteScheduledAt: typeof o.deleteScheduledAt === "number" ? o.deleteScheduledAt : undefined,
            status: o.status,
            moderationBlocked: o.moderationBlocked,
            moderationBlockedAt: typeof o.moderationBlockedAt === "number" ? o.moderationBlockedAt : undefined,
            listingsCount: o.listingsCount,
            reportsCount: o.reportsCount,
            listings,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUserDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailUserId]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void fetch("/api/admin/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const items = (d as { reports?: unknown }).reports;
        if (!Array.isArray(items)) return;
        const cleaned = items.filter((x) => {
          if (!x || typeof x !== "object") return false;
          const o = x as Record<string, unknown>;
          return (
            typeof o.id === "string" &&
            typeof o.reporterId === "string" &&
            typeof o.targetType === "string" &&
            typeof o.targetId === "string" &&
            typeof o.reason === "string" &&
            typeof o.comment === "string" &&
            typeof o.createdAt === "number"
          );
        }).map((x) => {
          const o = x as Record<string, unknown>;
          const row: AdminReportRow = {
            id: o.id as string,
            reporterId: o.reporterId as string,
            targetType: o.targetType as string,
            targetId: o.targetId as string,
            reason: o.reason as string,
            comment: o.comment as string,
            createdAt: o.createdAt as number,
          };
          if (typeof o.reporterDisplay === "string") row.reporterDisplay = o.reporterDisplay;
          if (typeof o.targetDisplay === "string") row.targetDisplay = o.targetDisplay;
          const lid = typeof o.listingId === "string" ? o.listingId.trim() : "";
          if (lid) {
            row.listingId = lid;
            row.listingTitle = typeof o.listingTitle === "string" ? o.listingTitle : "Объявление";
          }
          const tu = typeof o.targetUserId === "string" ? o.targetUserId.trim() : "";
          if (tu) row.targetUserId = tu;
          if (typeof o.listingSoftDeleted === "boolean") row.listingSoftDeleted = o.listingSoftDeleted;
          const cdp = o.complaintDeletedPreview;
          if (cdp && typeof cdp === "object") {
            const p = cdp as Record<string, unknown>;
            if (
              typeof p.deletedAt === "number" &&
              typeof p.title === "string" &&
              typeof p.category === "string" &&
              typeof p.type === "string" &&
              typeof p.city === "string" &&
              typeof p.preview === "string"
            ) {
              row.complaintDeletedPreview = {
                deletedAt: p.deletedAt,
                title: p.title,
                category: p.category,
                type: p.type,
                city: p.city,
                preview: p.preview,
              };
            }
          }
          return row;
        });
        setReports(cleaned);
        setCounts((c) => ({ ...c, reports: cleaned.length }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loaded, reportsReload]);

  if (!loaded) {
    return <div className="text-sm text-black/60">Загрузка…</div>;
  }

  return (
    <div className="space-y-4">
      <PasswordChangeModal apiPath="/api/admin/change-password" dialogTitle="Смена пароля администратора" />
      <Tabs value={tab} onChange={setTab} counts={counts} />

      {tab === "users" ? (
        <div className="space-y-4">
          {usersLoading ? <div className="text-sm text-black/60">Загрузка пользователей…</div> : null}
          <div className="overflow-x-auto rounded-3xl border border-black/10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-black/55">
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Пользователь</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Имя</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Регистрация</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Статус</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Объявления</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Жалобы</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr key={u.id} className="border-b border-black/5 last:border-b-0">
                    <td className="max-w-[280px] px-4 py-3 text-black/80">
                      <div className="truncate font-medium" title={u.reporterLabel}>
                        {u.reporterLabel}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-black/50">
                        <span className="min-w-0 truncate font-mono" title={u.id}>
                          ID: {u.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const p = navigator.clipboard?.writeText(u.id);
                            if (p) void p.catch(() => {});
                          }}
                          className="shrink-0 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[11px] font-semibold text-black/65 hover:bg-black/[0.04]"
                        >
                          Копировать
                        </button>
                      </div>
                    </td>
                    <td
                      className="max-w-[160px] truncate px-4 py-3 text-black/80"
                      title={adminUsersTableResolvedName(u)}
                    >
                      {adminUsersTableResolvedName(u)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{new Date(u.createdAt).toLocaleString("ru-RU")}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/80">{userStatusRu[u.status] ?? u.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{u.listingsCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">{u.reportsCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailUserId(u.id)}
                          className="h-8 rounded-xl border border-black/15 bg-white px-3 text-xs font-semibold text-black hover:bg-black/5"
                        >
                          Открыть
                        </button>
                        {!u.moderationBlocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              void fetch(`/api/admin/users/${encodeURIComponent(u.id)}/block`, { method: "POST" }).then(() => {
                                refreshUsers();
                                bumpUserDetail(u.id);
                              });
                            }}
                            className="h-8 rounded-xl border border-black/15 bg-white px-3 text-xs font-semibold text-black hover:bg-black/5"
                          >
                            Заблокировать
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void fetch(`/api/admin/users/${encodeURIComponent(u.id)}/unblock`, { method: "POST" }).then(() => {
                                refreshUsers();
                                bumpUserDetail(u.id);
                              });
                            }}
                            className="h-8 rounded-xl border border-black/15 bg-white px-3 text-xs font-semibold text-black hover:bg-black/5"
                          >
                            Разблокировать
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !confirm(
                                "Удалить и анонимизировать аккаунт? Объявления будут удалены, сессии сброшены. Действие необратимо.",
                              )
                            )
                              return;
                            void fetch(`/api/admin/users/${encodeURIComponent(u.id)}/anonymize`, { method: "POST" }).then(() => {
                              refreshUsers();
                              setDetailUserId((cur) => (cur === u.id ? null : cur));
                            });
                          }}
                          className="h-8 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!usersLoading && adminUsers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-white p-6">
              <div className="text-sm text-black/70">Нет пользователей.</div>
            </div>
          ) : null}

          {detailUserId ? (
            <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-lg font-semibold tracking-tight">Карточка пользователя</div>
                <button
                  type="button"
                  onClick={() => setDetailUserId(null)}
                  className="h-9 rounded-2xl border border-black/15 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/5"
                >
                  Закрыть
                </button>
              </div>
              {userDetailLoading ? (
                <div className="mt-3 text-sm text-black/60">Загрузка…</div>
              ) : userDetail ? (
                <div className="mt-4 space-y-3 text-sm text-black/70">
                  <div>
                    <span className="text-black/50">Пользователь:</span>{" "}
                    <span className="text-black/85">{userDetail.reporterLabel}</span>
                  </div>
                  <div>
                    <span className="text-black/50">Имя:</span>{" "}
                    {adminUsersTableResolvedName(userDetail)}
                  </div>
                  {userDetail.loginOrEmail.trim() ? (
                    <div className="text-xs text-black/50">Контакт: {userDetail.loginOrEmail}</div>
                  ) : null}
                  <div>
                    <span className="text-black/50">Регистрация:</span> {new Date(userDetail.createdAt).toLocaleString("ru-RU")}
                  </div>
                  {userDetail.lastSeenAt ? (
                    <div>
                      <span className="text-black/50">Был активен:</span> {new Date(userDetail.lastSeenAt).toLocaleString("ru-RU")}
                    </div>
                  ) : null}
                  <div>
                    <span className="text-black/50">Статус:</span> {userStatusRu[userDetail.status] ?? userDetail.status}
                  </div>
                  {userDetail.deletionStatus === "pending_deletion" && userDetail.deleteScheduledAt ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      Ожидает удаления. Запланировано: {new Date(userDetail.deleteScheduledAt).toLocaleString("ru-RU")}
                      {userDetail.deleteRequestedAt ? (
                        <span className="block text-xs text-amber-800/90">
                          Запрошено: {new Date(userDetail.deleteRequestedAt).toLocaleString("ru-RU")}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <span className="text-black/50">Жалобы (связь):</span> {userDetail.reportsCount}
                  </div>
                  <div>
                    <span className="text-black/50">Телефон в объявлениях (настройка):</span>{" "}
                    {userDetail.phoneVisible ? "виден" : "скрыт"}
                  </div>
                  <div className="border-t border-black/10 pt-3">
                    <div className="font-semibold text-black/80">Объявления ({userDetail.listings.length})</div>
                    <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                      {userDetail.listings.map((l) => (
                        <li key={l.id} className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2">
                          <div className="font-medium text-black/85">{l.title}</div>
                          <div className="text-xs text-black/55">
                            {l.status} · {l.dealStatus}
                            {l.city ? ` · ${l.city}` : ""} · {new Date(l.createdAt).toLocaleString("ru-RU")}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {userDetail.listings.length === 0 ? <div className="mt-2 text-black/50">Нет объявлений.</div> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {!userDetail.moderationBlocked ? (
                      <button
                        type="button"
                        onClick={() => {
                          void fetch(`/api/admin/users/${encodeURIComponent(userDetail.id)}/block`, { method: "POST" }).then(() => {
                            refreshUsers();
                            bumpUserDetail(userDetail.id);
                          });
                        }}
                        className="h-10 rounded-2xl border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
                      >
                        Заблокировать
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void fetch(`/api/admin/users/${encodeURIComponent(userDetail.id)}/unblock`, { method: "POST" }).then(() => {
                            refreshUsers();
                            bumpUserDetail(userDetail.id);
                          });
                        }}
                        className="h-10 rounded-2xl border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
                      >
                        Разблокировать
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !confirm(
                            "Удалить и анонимизировать аккаунт? Объявления будут удалены, сессии сброшены. Действие необратимо.",
                          )
                        )
                          return;
                        void fetch(`/api/admin/users/${encodeURIComponent(userDetail.id)}/anonymize`, {
                          method: "POST",
                        }).then(() => {
                          refreshUsers();
                          setDetailUserId(null);
                        });
                      }}
                      className="h-10 rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Удалить / анонимизировать
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-black/60">Не удалось загрузить профиль.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "support" ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            {supportLoading ? <div className="text-sm text-black/60">Загрузка обращений…</div> : null}
            {supportDeleteError ? <div className="text-sm text-red-700">{supportDeleteError}</div> : null}
            <div className="overflow-x-auto rounded-3xl border border-black/10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-black/55">
                    <th className="px-3 py-2 font-semibold">Пользователь</th>
                    <th className="px-3 py-2 font-semibold">Тип</th>
                    <th className="px-3 py-2 font-semibold">Статус</th>
                    <th className="px-3 py-2 font-semibold">Обновлено</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {supportRows.map((row) => (
                    <tr
                      key={row.id}
                      className={[
                        "border-b border-black/5 last:border-b-0",
                        supportTicketId === row.id ? "bg-orange-50/40" : "",
                      ].join(" ")}
                    >
                      <td
                        className="max-w-[200px] px-3 py-2 text-black/80"
                        title={
                          [
                            row.source === "public_feedback" ? "Обратная связь" : "Из аккаунта",
                            resolveSupportUserLabel(row.userId, row.userLabel),
                            row.contactEmail,
                            row.contactPhone,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        }
                      >
                        <div className="text-[10px] font-medium leading-tight text-black/45">
                          {row.source === "public_feedback" ? "Обратная связь" : "Из аккаунта"}
                        </div>
                        <div className="truncate">
                          {resolveSupportUserLabel(row.userId, row.userLabel)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-black/75">
                        {supportCategoryRu[row.category] ?? row.category}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-black/75">{supportStatusRu[row.status] ?? row.status}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-black/60">
                        {new Date(row.updatedAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSupportTicketId(row.id)}
                            className="h-8 rounded-xl border border-black/15 bg-white px-3 text-xs font-semibold hover:bg-black/5"
                          >
                            Открыть
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSupportDeleteError(null);
                              if (!confirm("Удалить обращение?")) return;
                              void fetch("/api/admin/support/delete", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: row.id }),
                              })
                                .then(async (r) => {
                                  if (!r.ok) throw new Error("delete_failed");
                                  setSupportRows((rows) => rows.filter((x) => x.id !== row.id));
                                  setCounts((c) => ({ ...c, support: Math.max(0, c.support - 1) }));
                                  if (supportTicketId === row.id) setSupportTicketId(null);
                                })
                                .catch(() => setSupportDeleteError("Не удалось удалить обращение."));
                            }}
                            className="h-8 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!supportLoading && supportRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-black/15 bg-white p-6 text-sm text-black/70">Нет обращений.</div>
            ) : null}
          </div>

          {supportTicketId ? (
            <div className="w-full shrink-0 rounded-3xl border border-black/10 bg-white p-4 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] lg:max-w-md lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-black/85">Тикет</div>
                <button
                  type="button"
                  onClick={() => setSupportTicketId(null)}
                  className="h-8 rounded-xl border border-black/15 px-2 text-xs font-semibold text-black/65 hover:bg-black/5"
                >
                  Закрыть панель
                </button>
              </div>
              {supportDetailLoading ? (
                <div className="mt-2 text-sm text-black/55">Загрузка…</div>
              ) : supportMeta ? (
                <>
                  <div className="mt-2 text-[10px] text-black/50">
                    Источник:{" "}
                    {supportMeta.source === "public_feedback" ? "Обратная связь" : "Из аккаунта"}
                  </div>
                  <div className="mt-2 text-xs text-black/70">
                    <span className="text-black/50">Пользователь:</span>{" "}
                    {resolveSupportUserLabel(supportMeta.userId, supportMeta.userDisplayName)}
                  </div>
                  {supportMeta.source === "public_feedback" ? (
                    <div className="mt-2 space-y-1 rounded-xl border border-black/10 bg-black/[0.02] px-2.5 py-2 text-xs text-black/75">
                      {(supportMeta.contactName ?? "").trim() ? (
                        <div>
                          <span className="text-black/45">Имя: </span>
                          {(supportMeta.contactName ?? "").trim()}
                        </div>
                      ) : null}
                      {(supportMeta.contactEmail ?? "").trim() ? (
                        <div className="break-all">
                          <span className="text-black/45">Email: </span>
                          {(supportMeta.contactEmail ?? "").trim()}
                        </div>
                      ) : null}
                      {(supportMeta.contactPhone ?? "").trim() ? (
                        <div>
                          <span className="text-black/45">Телефон: </span>
                          {(supportMeta.contactPhone ?? "").trim()}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-2 text-sm text-black/80">
                    {supportCategoryRu[supportMeta.category] ?? supportMeta.category}
                    {supportMeta.listingTitle ? (
                      <span className="text-black/50"> · {supportMeta.listingTitle}</span>
                    ) : null}
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-black/55">
                    Статус
                    <select
                      value={supportMeta.status}
                      onChange={(e) => {
                        const st = e.target.value;
                        void fetch(`/api/support/${encodeURIComponent(supportTicketId)}/status`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: st }),
                        }).then(() => {
                          refreshSupport();
                          loadSupportTicket(supportTicketId);
                        });
                      }}
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-2 py-2 text-sm"
                    >
                      <option value="open">{supportStatusRu.open}</option>
                      <option value="in_progress">{supportStatusRu.in_progress}</option>
                      <option value="closed">{supportStatusRu.closed}</option>
                    </select>
                  </label>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.02] p-2">
                    {supportMessages.map((m) => {
                      const kind = inferredSupportSenderType({
                        role: m.role,
                        senderType: m.senderType,
                      });
                      const staff = kind !== "user";
                      const { label: staffPanelLabel } = supportMessageLabelAdminPanel(kind);
                      return (
                        <div key={m.id} className={["flex", staff ? "justify-end" : "justify-start"].join(" ")}>
                          <div
                            className={[
                              "max-w-[92%] rounded-2xl border px-2.5 py-2 text-xs",
                              staff ? "border-orange-200/60 bg-orange-50/70" : "border-black/10 bg-white",
                            ].join(" ")}
                          >
                            <div className="mb-0.5 text-[10px] font-medium text-black/45">
                              {staff
                                ? staffPanelLabel
                                : resolveSupportUserLabel(supportMeta.userId, supportMeta.userDisplayName)}
                              {" · "}
                              {new Date(m.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <div className="whitespace-pre-wrap text-black/85">{m.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <textarea
                      value={supportReply}
                      onChange={(e) => setSupportReply(e.target.value)}
                      rows={2}
                      placeholder="Ответ…"
                      className="min-h-[40px] flex-1 resize-none rounded-xl border border-black/10 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                    />
                    <button
                      type="button"
                      disabled={!supportReply.trim() || supportReplyBusy}
                      onClick={() => {
                        const t = supportReply.trim();
                        if (!t) return;
                        setSupportReplyBusy(true);
                        void fetch(`/api/support/${encodeURIComponent(supportTicketId)}/message`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ text: t }),
                        })
                          .then(() => {
                            setSupportReply("");
                            refreshSupport();
                            loadSupportTicket(supportTicketId);
                          })
                          .finally(() => setSupportReplyBusy(false));
                      }}
                      className="h-9 shrink-0 self-end rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-45"
                    >
                      Отправить
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-red-700">Не удалось загрузить тикет.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "reports" ? (
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 md:grid-cols-2">
          {reports
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((r) => {
              const lid = r.listingId?.trim();
              const listingHref = lid ? `/listing/${encodeURIComponent(lid)}` : "";
              const orphanListingComplaint =
                r.targetType === "listing" && Boolean((r.targetId ?? "").trim()) && !lid;
              const listingSoftDeleted = Boolean(r.listingSoftDeleted);
              const delPrev = r.complaintDeletedPreview;
              const targetUid = r.targetUserId?.trim() ?? "";
              const profileHref = targetUid ? `/profile/${encodeURIComponent(targetUid)}` : "";
              const targetBlocked = targetUid ? Boolean(adminUsers.find((u) => u.id === targetUid)?.moderationBlocked) : false;

              return (
                <div
                  key={r.id}
                  className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)]"
                >
                  <div className="flex flex-nowrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div className="text-sm font-semibold text-black/80">{r.reason}</div>
                        <div className="shrink-0 text-xs text-black/50">{new Date(r.createdAt).toLocaleString("ru-RU")}</div>
                      </div>
                      {orphanListingComplaint ? (
                        <div className="mt-1.5 text-xs text-black/60">Объявление удалено</div>
                      ) : listingSoftDeleted && delPrev ? (
                        <div className="mt-1.5 space-y-1 text-xs text-black/65">
                          <div className="font-semibold text-black/75">Объявление удалено</div>
                          <div className="text-sm font-medium text-black/80">{delPrev.title}</div>
                          <div>
                            {delPrev.type} · {delPrev.category} · {delPrev.city}
                          </div>
                          <div className="line-clamp-3 whitespace-pre-wrap text-black/70">{delPrev.preview}</div>
                          <div className="text-black/50">
                            Удалено: {new Date(delPrev.deletedAt).toLocaleString("ru-RU")}
                          </div>
                        </div>
                      ) : listingSoftDeleted ? (
                        <div className="mt-1.5 text-xs text-black/60">Объявление удалено</div>
                      ) : lid && listingHref ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Link href={listingHref} className="truncate text-sm font-semibold text-black/80 underline decoration-black/20 hover:text-black">
                            {r.listingTitle?.trim() || "Объявление"}
                          </Link>
                          <Link href={listingHref} className={adminReportActionBtn}>
                            Открыть
                          </Link>
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-xs text-black/60">
                        Репортёр:{" "}
                        <Link href={`/profile/${encodeURIComponent(r.reporterId)}`} className="font-medium text-black/70 underline decoration-black/15 hover:text-black">
                          {resolveReportReporterDisplay(r)}
                        </Link>
                      </div>
                      {targetUid ? (
                        <div className="mt-1 text-xs text-black/60">
                          На пользователя:{" "}
                          <Link href={profileHref || "#"} className="font-medium text-black/70 underline decoration-black/15 hover:text-black">
                            {resolveComplaintUserLabel(targetUid)}
                          </Link>
                        </div>
                      ) : null}
                      {r.comment?.trim() ? (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-black/70">{r.comment}</div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1 self-start">
                      {!orphanListingComplaint && !listingSoftDeleted && lid && listingHref ? (
                        <Link href={listingHref} className={adminReportActionBtn}>
                          Открыть объявление
                        </Link>
                      ) : null}
                      {profileHref ? (
                        <Link href={profileHref} className={adminReportActionBtn}>
                          Открыть профиль
                        </Link>
                      ) : null}
                      {!orphanListingComplaint && !listingSoftDeleted && lid ? (
                        <button
                          type="button"
                          className={adminReportDangerBtn}
                          onClick={() => {
                            if (!confirm("Вы уверены?")) return;
                            void fetch(`/api/listings/${encodeURIComponent(lid)}`, {
                              method: "DELETE",
                              credentials: "include",
                              cache: "no-store",
                            }).then((res) => {
                              if (res.ok) {
                                void refreshListings();
                                bumpReports();
                              }
                            });
                          }}
                        >
                          Удалить объявление
                        </button>
                      ) : null}
                      {targetUid && !targetBlocked ? (
                        <button
                          type="button"
                          className={adminReportDangerBtn}
                          onClick={() => {
                            if (!confirm("Вы уверены?")) return;
                            void fetch(`/api/admin/users/${encodeURIComponent(targetUid)}/block`, { method: "POST" }).then(() => {
                              refreshUsers();
                              bumpReports();
                            });
                          }}
                        >
                          Заблокировать пользователя
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={adminReportActionBtn}
                        onClick={() => {
                          void fetch(`/api/admin/reports/${encodeURIComponent(r.id)}/dismiss`, { method: "POST" }).then((res) => {
                            if (res.ok) bumpReports();
                          });
                        }}
                      >
                        Отклонить жалобу
                      </button>
                      <button
                        type="button"
                        className={adminReportDangerBtn}
                        onClick={() => {
                          if (!confirm("Удалить жалобу из очереди?")) return;
                          void fetch(`/api/admin/reports/${encodeURIComponent(r.id)}`, { method: "DELETE" }).then((res) => {
                            if (res.ok) bumpReports();
                          });
                        }}
                      >
                        Удалить жалобу
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          {reports.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-black/15 bg-white p-6">
              <div className="text-sm text-black/70">Пока нет жалоб.</div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              ownerLabel={
                (l.authorPublicName ?? "").trim() || ownerLabelById.get((l.ownerId ?? "").trim()) || ""
              }
              onPublish={() => void setStatus(l.id, "approved").catch(() => {})}
              onReject={() => void setStatus(l.id, "rejected").catch(() => {})}
              onDelete={() => void deleteListing(l.id).catch(() => {})}
            />
          ))}
          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-white p-6 md:col-span-2">
              <div className="text-sm text-black/70">
                {tab === "pending"
                  ? "Нет объявлений на проверке."
                  : tab === "published"
                    ? "Нет опубликованных объявлений."
                    : "Нет отклонённых объявлений."}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

