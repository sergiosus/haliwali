"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appendReturnUrlQuery } from "../../lib/returnNavigation";
type ChatCrmStatus = "new" | "in_progress" | "waiting" | "done";

type WorkspaceChat = {
  conversationId: string;
  chatType: "listing" | "company";
  title: string;
  listingId: string;
  companyId: number;
  otherUserId: string;
  peerLabel: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
  crmStatus: ChatCrmStatus;
  openTaskCount: number;
  hasSummary: boolean;
};

type WorkspaceTask = {
  id: number;
  conversationId: string;
  title: string;
  deadlineText: string;
  assigneeText: string;
  createdAt: number;
  contextTitle: string;
};

type WorkspaceSummary = {
  conversationId: string;
  summaryPreview: string;
  createdAt: number;
  contextTitle: string;
};

type WorkspaceNote = {
  kind: "support" | "crm_note";
  id: string;
  title: string;
  preview: string;
  statusLabel: string;
  updatedAt: number;
  href: string;
};

const CRM_STATUS_OPTIONS: Array<{ value: ChatCrmStatus | ""; label: string }> = [
  { value: "", label: "Все статусы" },
  { value: "new", label: "Новый" },
  { value: "in_progress", label: "В работе" },
  { value: "waiting", label: "Ожидание" },
  { value: "done", label: "Завершено" },
];

const CRM_STATUS_LABEL: Record<ChatCrmStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  waiting: "Ожидание",
  done: "Завершено",
};

function fmtWhen(ts: number) {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chatHref(c: WorkspaceChat): string {
  const base =
    c.chatType === "company" && c.companyId > 0
      ? `/chat?chatType=company&companyId=${encodeURIComponent(String(c.companyId))}&peerUserId=${encodeURIComponent(c.otherUserId)}`
      : `/chat?listingId=${encodeURIComponent(c.listingId)}&peerUserId=${encodeURIComponent(c.otherUserId)}`;
  return appendReturnUrlQuery(base, "/account?tab=workspace");
}

function taskChatHref(t: WorkspaceTask, chats: WorkspaceChat[]): string {
  const row = chats.find((c) => c.conversationId === t.conversationId);
  if (row) return chatHref(row);
  return "/account?tab=workspace";
}

export function AccountWorkspacePanel({ authed }: { authed: boolean }) {
  const [statusFilter, setStatusFilter] = useState<ChatCrmStatus | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hasTasksOnly, setHasTasksOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<WorkspaceChat[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (unreadOnly) p.set("unread", "1");
    if (hasTasksOnly) p.set("hasTasks", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [statusFilter, unreadOnly, hasTasksOnly]);

  const load = useCallback(async () => {
    if (!authed) {
      setChats([]);
      setTasks([]);
      setSummaries([]);
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/workspace${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        chats?: WorkspaceChat[];
        tasks?: WorkspaceTask[];
        summaries?: WorkspaceSummary[];
        notes?: WorkspaceNote[];
      };
      if (!res.ok || !data.ok) {
        setError(typeof data.message === "string" ? data.message : "Не удалось загрузить данные.");
        setChats([]);
        setTasks([]);
        setSummaries([]);
        setNotes([]);
        return;
      }
      setChats(Array.isArray(data.chats) ? data.chats : []);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch {
      setError("Не удалось загрузить данные.");
      setChats([]);
      setTasks([]);
      setSummaries([]);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [authed, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!authed) {
    return (
      <div className="rounded-2xl border border-dashed border-black/15 bg-white p-6 text-sm text-black/60">
        Войдите в аккаунт, чтобы открыть рабочее пространство.
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <p className="text-sm text-black/60">
        Краткий обзор чатов, задач и заметок — без открытия каждой переписки отдельно.
      </p>

      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 sm:max-w-[200px] sm:flex-none">
          <span className="sr-only">Статус</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ChatCrmStatus | "")}
            className="w-full min-w-0 bg-transparent text-sm font-medium text-black/80 outline-none"
          >
            {CRM_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)} label="Непрочитанные" />
        <FilterChip active={hasTasksOnly} onClick={() => setHasTasksOnly((v) => !v)} label="С задачами" />
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">{error}</div>
      ) : null}

      {loading && chats.length === 0 && tasks.length === 0 ? (
        <div className="text-sm text-black/55">Загрузка…</div>
      ) : null}

      <WorkspaceSection title="Активные чаты" count={chats.length} empty="Нет чатов по выбранным фильтрам.">
        <div className="grid gap-2">
          {chats.map((c) => (
            <Link
              key={c.conversationId}
              href={chatHref(c)}
              className="block rounded-2xl border border-black/10 bg-white px-3 py-2.5 transition-colors hover:bg-black/[0.02]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-black/90">
                    {c.title}
                    {c.unreadCount > 0 ? (
                      <span className="ml-2 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" aria-hidden />
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-black/55">{c.peerLabel}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-black/60">
                    {c.lastMessageText.trim() || "—"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-black/50">
                    <span>{CRM_STATUS_LABEL[c.crmStatus]}</span>
                    {c.openTaskCount > 0 ? <span>Задач: {c.openTaskCount}</span> : null}
                    {c.hasSummary ? <span>Есть summary</span> : null}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-black/45">{fmtWhen(c.lastMessageAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Задачи" count={tasks.length} empty="Открытых задач нет.">
        <div className="grid gap-2">
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={taskChatHref(t, chats)}
              className="block rounded-2xl border border-black/10 bg-white px-3 py-2.5 hover:bg-black/[0.02]"
            >
              <div className="text-sm font-semibold text-black/90">{t.title}</div>
              <div className="mt-1 text-xs text-black/55">{t.contextTitle}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-black/50">
                <span>Срок: {t.deadlineText || "без срока"}</span>
                {t.assigneeText ? <span>Ответственный: {t.assigneeText}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="AI summaries" count={summaries.length} empty="Сохранённых summary пока нет.">
        <div className="grid gap-2">
          {summaries.map((s) => (
            <div key={s.conversationId} className="rounded-2xl border border-black/10 bg-white px-3 py-2.5">
              <div className="text-xs font-semibold text-black/55">{s.contextTitle}</div>
              <div className="mt-1 line-clamp-4 text-sm text-black/75">{s.summaryPreview}</div>
              <div className="mt-1 text-[11px] text-black/45">{fmtWhen(s.createdAt)}</div>
            </div>
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Обращения и заметки" count={notes.length} empty="Нет обращений и заметок.">
        <div className="grid gap-2">
          {notes.map((n) => (
            <Link
              key={n.id}
              href={appendReturnUrlQuery(n.href, "/account?tab=workspace")}
              className="block rounded-2xl border border-black/10 bg-white px-3 py-2.5 hover:bg-black/[0.02]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-black/90">{n.title}</div>
                <span className="text-[11px] font-medium text-black/45">{n.statusLabel}</span>
              </div>
              <div className="mt-1 text-[11px] text-black/45">
                {n.kind === "support" ? "Поддержка" : "Заметка в чате"}
              </div>
              {n.preview ? <div className="mt-1 line-clamp-2 text-sm text-black/60">{n.preview}</div> : null}
              <div className="mt-1 text-[11px] text-black/45">{fmtWhen(n.updatedAt)}</div>
            </Link>
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-9 shrink-0 items-center rounded-xl border px-3 text-sm font-semibold transition-colors",
        active ? "border-orange-300 bg-orange-50 text-orange-900" : "border-black/10 bg-white text-black/75 hover:bg-black/[0.03]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function WorkspaceSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-black/[0.02] p-3 sm:p-4">
      <h2 className="text-sm font-semibold text-black/85">
        {title}
        {count > 0 ? <span className="ml-2 font-medium text-black/45">({count})</span> : null}
      </h2>
      <div className="mt-3">{count === 0 ? <div className="text-sm text-black/55">{empty}</div> : children}</div>
    </section>
  );
}
