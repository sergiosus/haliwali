"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import type { StoredSupportTicket } from "../lib/serverSupportStore";
import {
  deriveSupportSubject,
  inferredSupportSenderType,
  supportAppealClosedForUser,
  supportCategoryLabelRu,
  supportMessageLabelUserCabinet,
} from "../lib/supportUiLabels";

type MineAppealRow = {
  id: string;
  type: string;
  category: string;
  subject: string;
  status: string;
  updatedAt: number;
  createdAt: number;
  preview: string;
  messageCount: number;
};

type TicketMsg = {
  id: string;
  role: string;
  senderType?: string;
  text: string;
  createdAt: number;
};

type TicketDetail = {
  id: string;
  userId: string;
  category: string;
  status: string;
  messages: TicketMsg[];
  subject?: string;
  listingId?: string;
  listingTitle?: string;
  createdAt: number;
  updatedAt: number;
};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "question", label: "Вопрос" },
  { value: "listing_problem", label: "Проблема с объявлением" },
  { value: "user_report", label: "Жалоба на пользователя" },
  { value: "other", label: "Другое" },
];

function userStatusRu(status: string): "Открыто" | "Закрыто" {
  return supportAppealClosedForUser(status) ? "Закрыто" : "Открыто";
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; json: T; status: number }> {
  const r = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  const json = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, json, status: r.status };
}

export default function SupportPage() {
  const auth = useAuth();

  const [appeals, setAppeals] = useState<MineAppealRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const createModeRef = useRef(false);

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [category, setCategory] = useState("question");
  const [theme, setTheme] = useState("");
  const [message, setMessage] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const authed = auth.status === "ready" && Boolean(auth.userId?.trim());

  useEffect(() => {
    createModeRef.current = createMode;
  }, [createMode]);

  const refreshAppeals = useCallback(async (): Promise<MineAppealRow[]> => {
    const res = await fetchJson<{ appeals?: MineAppealRow[] } & { error?: string }>("/api/support/mine");
    if (!res.ok) {
      return [];
    }
    const rows = Array.isArray(res.json.appeals) ? res.json.appeals : [];

    const list: MineAppealRow[] = [];
    for (const x of rows) {
      if (!x || typeof x.id !== "string" || !x.id.trim()) continue;
      list.push(x);
    }

    setAppeals(list);
    setSelectedId((sid) => {
      if (createModeRef.current) return sid ?? null;
      if (!list.length) return null;
      if (sid && list.some((a) => a.id === sid)) return sid;
      return list[0]?.id ?? null;
    });

    return list;
  }, []);

  useEffect(() => {
    if (!authed) {
      setAppeals([]);
      setSelectedId(null);
      setDetail(null);
      setCreateMode(false);
      return;
    }
    let cancel = false;
    setListLoading(true);
    void refreshAppeals()
      .finally(() => {
        if (!cancel) setListLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [authed, refreshAppeals]);

  useEffect(() => {
    if (!authed || !selectedId || createMode) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void fetchJson<{ ticket?: TicketDetail }>(`/api/support/${encodeURIComponent(selectedId)}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setDetail(null);
          setDetailError(res.status === 401 ? "Нет доступа к этому обращению." : "Не удалось загрузить обращение.");
          return;
        }
        const t = res.json.ticket;
        if (!t || typeof t !== "object" || !Array.isArray(t.messages)) {
          setDetail(null);
          setDetailError("Некорректный ответ сервера.");
          return;
        }
        setDetail(t as TicketDetail);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authed, selectedId, createMode]);

  async function onCreateAppeal(e: React.FormEvent) {
    e.preventDefault();
    setToast(null);
    if (!message.trim()) {
      setToast("Введите текст сообщения.");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetchJson<{ ok?: boolean; id?: string }>("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          theme: theme.trim(),
          message: message.trim(),
        }),
      });

      const d = res.json as { ok?: boolean; id?: string; message?: string; error?: string };
      if (!res.ok || !d.ok) {
        setToast(typeof d.message === "string" ? d.message : "Не удалось создать обращение.");
        return;
      }
      const nid = typeof d.id === "string" ? d.id : "";
      setMessage("");
      setTheme("");
      setCreateMode(false);
      createModeRef.current = false;
      await refreshAppeals();
      if (nid) setSelectedId(nid);
    } catch {
      setToast("Сеть недоступна. Попробуйте позже.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function onSendFollowUp() {
    const id = selectedId?.trim();
    const t = reply.trim();
    if (!id || !t || replyBusy) return;
    setReplyBusy(true);
    setToast(null);
    try {
      const res = await fetchJson(`/api/support/${encodeURIComponent(id)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = res.json as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !("ok" in d && d.ok)) {
        const msg =
          typeof d.message === "string"
            ? d.message
            : d.error === "CLOSED"
              ? "Обращение закрыто."
              : "Не удалось отправить сообщение.";
        setToast(msg);
        return;
      }
      setReply("");
      await refreshAppeals();
      void fetchJson<{ ticket?: TicketDetail }>(`/api/support/${encodeURIComponent(id)}`).then((r2) => {
        if (r2.ok && r2.json.ticket) setDetail(r2.json.ticket as TicketDetail);
      });
    } catch {
      setToast("Сеть недоступна. Попробуйте позже.");
    } finally {
      setReplyBusy(false);
    }
  }

  function openCreate() {
    createModeRef.current = true;
    setCreateMode(true);
    setSelectedId(null);
    setToast(null);
  }

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm text-black/60 transition-colors hover:text-black"
        >
          ← Назад в кабинет
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Поддержка</h1>
        <p className="mt-2 max-w-xl text-sm text-black/60">
          Все обращения и ответы поддержки сохраняются здесь — в одном диалоге.
        </p>

        {toast ? (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/90 px-3 py-2 text-sm text-orange-950">
            {toast}
          </div>
        ) : null}

        {auth.status !== "ready" ? (
          <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60">Загрузка…</div>
        ) : !authed ? (
          <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/80">
            <p>Чтобы написать в поддержку, войдите в аккаунт.</p>
            <Link
              href={`/login?next=${encodeURIComponent("/support")}`}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:brightness-95"
            >
              Войти
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Список обращений */}
            <aside className="w-full shrink-0 lg:max-w-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-black/70">Обращения</h2>
                <button
                  type="button"
                  onClick={openCreate}
                  className="h-9 rounded-xl bg-[#ff7a00] px-3 text-xs font-semibold text-white hover:brightness-95"
                >
                  Новое обращение
                </button>
              </div>
              <div className="mt-3 max-h-[min(52vh,480px)] space-y-2 overflow-y-auto rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
                {listLoading ? (
                  <div className="px-3 py-6 text-center text-sm text-black/55">Загрузка списка…</div>
                ) : appeals.length === 0 ? (
                  <div className="space-y-3 px-3 py-6 text-center text-sm text-black/65">
                    <p>У вас пока нет обращений.</p>
                    <button
                      type="button"
                      onClick={openCreate}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/15 bg-white text-sm font-semibold text-black hover:bg-black/[0.03]"
                    >
                      Создать обращение
                    </button>
                  </div>
                ) : (
                  appeals.map((a) => {
                    const active = !createMode && selectedId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          createModeRef.current = false;
                          setCreateMode(false);
                          setSelectedId(a.id);
                          setToast(null);
                        }}
                        className={[
                          "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                          active ? "border-[#ff7a00]/55 bg-orange-500/[0.07]" : "border-transparent hover:bg-black/[0.03]",
                        ].join(" ")}
                      >
                        <div className="flex flex-wrap items-center gap-1 text-xs text-black/50">
                          <span className="font-medium text-black/70">{a.type}</span>
                          <span className="text-black/35">·</span>
                          <span className={a.status === "closed" ? "text-black/55" : "text-emerald-700"}>
                            {userStatusRu(a.status)}
                          </span>
                          <span className="text-black/35">·</span>
                          <span title={fmtDate(a.updatedAt)}>{fmtDate(a.updatedAt)}</span>
                        </div>
                        <div className="truncate font-semibold text-black/90" title={a.subject}>
                          {a.subject}
                        </div>
                        <div className="line-clamp-2 text-xs text-black/55" title={a.preview}>
                          {a.preview || "Без сообщений"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Диалог / форма создания */}
            <section className="min-h-[320px] min-w-0 flex-1">
              {createMode ? (
                <form
                  onSubmit={(e) => void onCreateAppeal(e)}
                  className="space-y-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
                >
                  <h2 className="text-lg font-semibold tracking-tight">Новое обращение</h2>
                  <label className="block text-sm font-medium text-black/80">
                    Тип обращения
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]"
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-black/80">
                    Тема
                    <input
                      type="text"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      placeholder="Кратко, о чём речь"
                      className="mt-1.5 w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-black/80">
                    Сообщение
                    <textarea
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      placeholder="Опишите проблему или вопрос"
                      className="mt-1.5 w-full resize-y rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={createBusy}
                      className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-xl bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
                    >
                      {createBusy ? "Отправка…" : "Отправить обращение"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode(false);
                        createModeRef.current = false;
                        setToast(null);
                        void refreshAppeals();
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-black/15 px-4 text-sm font-semibold text-black/80 hover:bg-black/[0.03]"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : appeals.length === 0 && !listLoading ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
                  <p className="max-w-md text-sm text-black/65">У вас пока нет обращений.</p>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ff7a00] px-5 text-sm font-semibold text-white hover:brightness-95"
                  >
                    Создать обращение
                  </button>
                </div>
              ) : detailLoading ? (
                <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-sm text-black/55 shadow-sm">
                  Загрузка переписки…
                </div>
              ) : detailError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-900">{detailError}</div>
              ) : detail ? (
                <div className="flex min-h-[320px] flex-col rounded-2xl border border-black/10 bg-white shadow-sm">
                  <header className="border-b border-black/[0.06] px-5 py-4">
                    <div className="text-xs font-medium text-black/50">{supportCategoryLabelRu(detail.category)}</div>
                    <div className="mt-1 text-lg font-semibold text-black">
                      {deriveSupportSubject(detail as unknown as StoredSupportTicket)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span
                        className={[
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          detail.status === "closed" ? "bg-black/[0.06] text-black/65" : "bg-emerald-500/15 text-emerald-800",
                        ].join(" ")}
                      >
                        {userStatusRu(detail.status)}
                      </span>
                      <span className="text-black/45">Обновлено: {fmtDate(detail.updatedAt)}</span>
                    </div>
                  </header>

                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 max-h-[min(52vh,480px)]">
                    {detail.messages.map((m) => {
                      const kind = inferredSupportSenderType({
                        role: m.role,
                        senderType: typeof m.senderType === "string" ? m.senderType : undefined,
                      });
                      const staff = kind !== "user";
                      return (
                        <div key={m.id} className={staff ? "flex justify-start" : "flex justify-end"}>
                          <div
                            className={[
                              "max-w-[min(94%,560px)] rounded-2xl border px-3 py-2.5 text-sm",
                              staff
                                ? "border-black/10 bg-black/[0.03] text-black/90"
                                : "border-[#ff7a00]/35 bg-orange-500/[0.08] text-black/90",
                            ].join(" ")}
                          >
                            <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[11px] font-medium text-black/45">
                              <span>{supportMessageLabelUserCabinet(kind)}</span>
                              <span>·</span>
                              <time dateTime={new Date(m.createdAt).toISOString()}>{fmtDate(m.createdAt)}</time>
                            </div>
                            <div className="whitespace-pre-wrap">{m.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!supportAppealClosedForUser(detail.status) ? (
                    <div className="border-t border-black/[0.06] px-4 py-3">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-black/45">
                        Ваш ответ
                        <textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={3}
                          placeholder="Дополнение к обращению…"
                          className="mt-2 w-full resize-y rounded-xl border border-black/12 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(255,122,0,0.22)]"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={replyBusy || !reply.trim()}
                        onClick={() => void onSendFollowUp()}
                        className="mt-3 inline-flex h-11 min-w-[160px] items-center justify-center rounded-xl bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:brightness-95 disabled:pointer-events-none disabled:opacity-45"
                      >
                        {replyBusy ? "Отправка…" : "Отправить"}
                      </button>
                    </div>
                  ) : (
                    <div className="border-t border-black/[0.06] px-4 py-4 text-center text-sm text-black/55">
                      Это обращение закрыто. Чтобы продолжить диалог с поддержкой, создайте новое обращение.
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={openCreate}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-4 text-xs font-semibold text-black hover:bg-black/[0.03]"
                        >
                          Создать обращение
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-sm text-black/55 shadow-sm">
                  Выберите обращение в списке слева.
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
