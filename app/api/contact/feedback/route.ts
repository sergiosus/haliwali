import path from "node:path";
import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isValidPhone, PHONE_VALIDATION_MESSAGE } from "../../../lib/identity";
import { usesPostgres } from "../../../lib/pgPool";
import { checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import {
  newMessageId,
  newSupportId,
  type StoredSupportMessage,
  type StoredSupportTicket,
  upsertSupportTicket,
} from "../../../lib/serverSupportStore";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const FEEDBACK_IP_RATE_PATH = path.join(DATA_DIR, "contact-feedback-ip-rate.json");
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_MAX_PER_WINDOW = 5;

/**
 * Публичная форма «Обратная связь» → PostgreSQL `support_tickets` / `support_messages`.
 * Без аккаунта; не смешивается с обращениями из кабинета (`source = account`).
 */
export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  await mkdir(DATA_DIR, { recursive: true });
  const ip = extractIp(req);
  const rl = await checkIpRateLimit({
    path: FEEDBACK_IP_RATE_PATH,
    ip,
    limit: FEEDBACK_MAX_PER_WINDOW,
    windowMs: FEEDBACK_WINDOW_MS,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "RATE_LIMIT", message: "Слишком много сообщений. Попробуйте позже." },
      { status: 429 },
    );
  }

  if (!usesPostgres()) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: "Обратная связь временно недоступна." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  const email = typeof o.email === "string" ? o.email.trim().slice(0, 200) : "";
  const phone = typeof o.phone === "string" ? o.phone.trim().slice(0, 40) : "";
  const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 200) : "";
  const message = typeof o.message === "string" ? o.message.trim() : "";

  if (!email && !phone) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Укажите email или телефон для связи." },
      { status: 400 },
    );
  }
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: PHONE_VALIDATION_MESSAGE }, { status: 400 });
  }
  if (subject.length < 3) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Тема: минимум 3 символа." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Сообщение: минимум 10 символов." }, { status: 400 });
  }

  const now = Date.now();
  const msg: StoredSupportMessage = {
    id: newMessageId(),
    role: "user",
    senderType: "user",
    text: message,
    createdAt: now,
  };

  const ticket: StoredSupportTicket = {
    id: newSupportId(),
    userId: "",
    source: "public_feedback",
    category: "feedback",
    subject,
    status: "open",
    messages: [msg],
    createdAt: now,
    updatedAt: now,
    ...(name ? { contactName: name } : {}),
    ...(email ? { contactEmail: email } : {}),
    ...(phone ? { contactPhone: phone } : {}),
  };

  await upsertSupportTicket(ticket);

  return NextResponse.json({ ok: true, id: ticket.id });
}
