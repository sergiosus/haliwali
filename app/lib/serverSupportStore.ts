import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const SUPPORT_PATH = path.join(process.cwd(), ".data", "support-tickets.json");

export type SupportMessageRole = "user" | "staff";

/** Подпись в UI: пользователь / линия поддержки / администратор. Для старых данных выводится из `role`. */
export type SupportSenderType = "user" | "support" | "admin";

export type StoredSupportMessage = {
  id: string;
  role: SupportMessageRole;
  /** Если нет — infer: staff → support, user → user. */
  senderType?: SupportSenderType;
  text: string;
  createdAt: number;
};

export type SupportTicketStatus = "open" | "in_progress" | "closed";

/** `account` — залогиненный пользователь; `public_feedback` — форма «Обратная связь» (без user_id в БД). */
export type SupportTicketSource = "account" | "public_feedback";

export type StoredSupportTicket = {
  id: string;
  userId: string;
  category: string;
  /** Короткая тема для списков (если пусто — выводится из первого сообщения). */
  subject?: string;
  status: SupportTicketStatus;
  messages: StoredSupportMessage[];
  createdAt: number;
  updatedAt: number;
  listingId?: string;
  listingTitle?: string;
  source?: SupportTicketSource;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type SupportFile = { tickets: StoredSupportTicket[] };

async function ensureDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function readSupportDb(): Promise<SupportFile> {
  if (!usesPostgres()) {
    assertFileStoreNotUsedInProduction("serverSupportStore.readSupportDb", { path: SUPPORT_PATH });
    const raw = await readJson<SupportFile>(SUPPORT_PATH, { tickets: [] });
    return {
      tickets: (raw.tickets ?? []).map((t) => ({
        ...t,
        source: (t.source === "public_feedback" ? "public_feedback" : "account") satisfies SupportTicketSource,
      })),
    };
  }

  // PostgreSQL is the source of truth when DATABASE_URL is set.
  const { rows: tickets } = await getPool().query<{
    id: string;
    user_id: string | null;
    category: string;
    subject: string;
    status: SupportTicketStatus;
    created_at: number;
    updated_at: number;
    listing_id: string | null;
    listing_title: string | null;
    source: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>(
    `SELECT id, user_id, category, subject, status, created_at, updated_at, listing_id, listing_title,
            source, contact_name, contact_email, contact_phone
     FROM support_tickets
     ORDER BY updated_at DESC`,
  );

  const ids = tickets.map((t) => t.id);
  const byTicket = new Map<string, StoredSupportMessage[]>();
  if (ids.length) {
    const { rows: msgs } = await getPool().query<{
      id: string;
      ticket_id: string;
      role: SupportMessageRole;
      sender_type: SupportSenderType | null;
      text: string;
      created_at: number;
    }>(
      `SELECT id, ticket_id, role, sender_type, text, created_at
       FROM support_messages
       WHERE ticket_id = ANY($1::text[])
       ORDER BY created_at ASC`,
      [ids],
    );
    for (const m of msgs) {
      const row: StoredSupportMessage = {
        id: m.id,
        role: m.role,
        ...(m.sender_type ? { senderType: m.sender_type } : {}),
        text: m.text,
        createdAt: Number(m.created_at),
      };
      const list = byTicket.get(m.ticket_id) ?? [];
      list.push(row);
      byTicket.set(m.ticket_id, list);
    }
  }

  const out: StoredSupportTicket[] = tickets.map((t) => {
    const src = (t.source ?? "").trim();
    const source: SupportTicketSource =
      src === "public_feedback" ? "public_feedback" : "account";
    return {
      id: t.id,
      userId: (t.user_id ?? "").trim(),
      category: t.category,
      ...(t.subject?.trim() ? { subject: t.subject.trim() } : {}),
      status: t.status,
      createdAt: Number(t.created_at),
      updatedAt: Number(t.updated_at),
      ...(t.listing_id ? { listingId: t.listing_id } : {}),
      ...(t.listing_title ? { listingTitle: t.listing_title } : {}),
      source,
      ...((t.contact_name ?? "").trim() ? { contactName: (t.contact_name ?? "").trim() } : {}),
      ...((t.contact_email ?? "").trim() ? { contactEmail: (t.contact_email ?? "").trim() } : {}),
      ...((t.contact_phone ?? "").trim() ? { contactPhone: (t.contact_phone ?? "").trim() } : {}),
      messages: byTicket.get(t.id) ?? [],
    };
  });

  return { tickets: out };
}

export async function writeSupportDb(data: SupportFile): Promise<void> {
  if (usesPostgres()) {
    // Postgres source of truth: keep this function for compatibility but don't write the JSON backup.
    void data;
    return;
  }
  assertFileStoreNotUsedInProduction("serverSupportStore.writeSupportDb", { path: SUPPORT_PATH });
  await ensureDir(SUPPORT_PATH);
  const tmp = `${SUPPORT_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, SUPPORT_PATH);
}

export function newSupportId(): string {
  return `sup-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export function newMessageId(): string {
  return `msg-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export async function getSupportTicketById(id: string): Promise<StoredSupportTicket | null> {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return null;
  if (!usesPostgres()) {
    const db = await readSupportDb();
    return db.tickets.find((t) => t.id === trimmed) ?? null;
  }

  const { rows } = await getPool().query<{
    id: string;
    user_id: string | null;
    category: string;
    subject: string;
    status: SupportTicketStatus;
    created_at: number;
    updated_at: number;
    listing_id: string | null;
    listing_title: string | null;
    source: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>(
    `SELECT id, user_id, category, subject, status, created_at, updated_at, listing_id, listing_title,
            source, contact_name, contact_email, contact_phone
     FROM support_tickets
     WHERE id = $1
     LIMIT 1`,
    [trimmed],
  );
  const t = rows[0];
  if (!t) return null;

  const { rows: msgs } = await getPool().query<{
    id: string;
    role: SupportMessageRole;
    sender_type: SupportSenderType | null;
    text: string;
    created_at: number;
  }>(
    `SELECT id, role, sender_type, text, created_at
     FROM support_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [trimmed],
  );

  const messages: StoredSupportMessage[] = msgs.map((m) => ({
    id: m.id,
    role: m.role,
    ...(m.sender_type ? { senderType: m.sender_type } : {}),
    text: m.text,
    createdAt: Number(m.created_at),
  }));

  const src = (t.source ?? "").trim();
  const source: SupportTicketSource = src === "public_feedback" ? "public_feedback" : "account";
  return {
    id: t.id,
    userId: (t.user_id ?? "").trim(),
    category: t.category,
    ...(t.subject?.trim() ? { subject: t.subject.trim() } : {}),
    status: t.status,
    createdAt: Number(t.created_at),
    updatedAt: Number(t.updated_at),
    ...(t.listing_id ? { listingId: t.listing_id } : {}),
    ...(t.listing_title ? { listingTitle: t.listing_title } : {}),
    source,
    ...((t.contact_name ?? "").trim() ? { contactName: (t.contact_name ?? "").trim() } : {}),
    ...((t.contact_email ?? "").trim() ? { contactEmail: (t.contact_email ?? "").trim() } : {}),
    ...((t.contact_phone ?? "").trim() ? { contactPhone: (t.contact_phone ?? "").trim() } : {}),
    messages,
  };
}

export async function upsertSupportTicket(ticket: StoredSupportTicket): Promise<void> {
  if (!usesPostgres()) {
    const db = await readSupportDb();
    const i = db.tickets.findIndex((t) => t.id === ticket.id);
    if (i === -1) db.tickets.push(ticket);
    else db.tickets[i] = ticket;
    await writeSupportDb(db);
    return;
  }

  const id = ticket.id.trim();
  const nowUpdated = typeof ticket.updatedAt === "number" && Number.isFinite(ticket.updatedAt) ? ticket.updatedAt : Date.now();
  const uid = ticket.userId.trim();
  const src: SupportTicketSource = ticket.source === "public_feedback" ? "public_feedback" : "account";
  await getPool().query(
    `INSERT INTO support_tickets (id, user_id, category, subject, status, created_at, updated_at, listing_id, listing_title, source, contact_name, contact_email, contact_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       category = EXCLUDED.category,
       subject = EXCLUDED.subject,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at,
       listing_id = EXCLUDED.listing_id,
       listing_title = EXCLUDED.listing_title,
       source = EXCLUDED.source,
       contact_name = EXCLUDED.contact_name,
       contact_email = EXCLUDED.contact_email,
       contact_phone = EXCLUDED.contact_phone`,
    [
      id,
      uid || null,
      ticket.category,
      (ticket.subject ?? "").trim(),
      ticket.status,
      ticket.createdAt,
      nowUpdated,
      ticket.listingId ?? null,
      ticket.listingTitle ?? null,
      src,
      (ticket.contactName ?? "").trim() || null,
      (ticket.contactEmail ?? "").trim() || null,
      (ticket.contactPhone ?? "").trim() || null,
    ],
  );

  // Upsert messages (idempotent by primary key).
  for (const m of ticket.messages ?? []) {
    const mid = (m.id ?? "").trim();
    if (!mid) continue;
    await getPool().query(
      `INSERT INTO support_messages (id, ticket_id, role, sender_type, text, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role,
         sender_type = EXCLUDED.sender_type,
         text = EXCLUDED.text,
         created_at = EXCLUDED.created_at`,
      [mid, id, m.role, (m.senderType ?? null) as string | null, m.text, m.createdAt],
    );
  }
}

export async function deleteSupportTicketById(id: string): Promise<boolean> {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return false;
  if (!usesPostgres()) {
    const db = await readSupportDb();
    const before = db.tickets.length;
    db.tickets = db.tickets.filter((t) => t.id !== trimmed);
    if (db.tickets.length === before) return false;
    await writeSupportDb(db);
    return true;
  }

  const res = await getPool().query(`DELETE FROM support_tickets WHERE id = $1`, [trimmed]);
  return (res.rowCount ?? 0) > 0;
}
