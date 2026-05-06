import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeEmail, normalizePhone } from "./identity";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

export type ConfirmMethod = "email" | "phone";

export type PendingRegistration = {
  id: string;
  email: string;
  phone: string;
  passwordHash: string;
  confirmMethod: ConfirmMethod;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  createdAt: number;
  lastSentAt: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const REQUESTS_PATH = path.join(DATA_DIR, "registration-requests.json");

function idForRow(r: PendingRegistration, method: ConfirmMethod): string {
  return method === "email" ? normalizeEmail(r.email) : normalizePhone(r.phone);
}

async function readJsonFile<T>(p: string, fallback: T): Promise<T> {
  assertFileStoreNotUsedInProduction("serverRegistrationStore.readJsonFile", { path: p });
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(p: string, data: T): Promise<void> {
  assertFileStoreNotUsedInProduction("serverRegistrationStore.writeJsonFile", { path: p });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

function rowFromPg(r: Record<string, unknown>): PendingRegistration {
  return {
    id: String(r.id ?? ""),
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    passwordHash: String(r.password_hash ?? ""),
    confirmMethod: r.confirm_method === "phone" ? "phone" : "email",
    codeHash: String(r.code_hash ?? ""),
    expiresAt: Number(r.expires_at),
    attempts: Number(r.attempts),
    consumed: Boolean(r.consumed),
    createdAt: Number(r.created_at),
    lastSentAt: Number(r.last_sent_at),
  };
}

export async function registrationInsertPending(row: PendingRegistration): Promise<void> {
  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO registration_pending
        (id, email, phone, password_hash, confirm_method, code_hash, expires_at, attempts, consumed, created_at, last_sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.id,
        normalizeEmail(row.email),
        normalizePhone(row.phone),
        row.passwordHash,
        row.confirmMethod,
        row.codeHash,
        row.expiresAt,
        row.attempts,
        row.consumed,
        row.createdAt,
        row.lastSentAt,
      ],
    );
    return;
  }
  const list = await readJsonFile<PendingRegistration[]>(REQUESTS_PATH, []);
  list.push(row);
  await writeJsonFile(REQUESTS_PATH, list);
}

export async function registrationFindLatestForCooldown(
  method: ConfirmMethod,
  identifier: string,
): Promise<PendingRegistration | null> {
  if (usesPostgres()) {
    const email = method === "email" ? identifier : "";
    const phone = method === "phone" ? identifier : "";
    const { rows } = await getPool().query(
      method === "email"
        ? `SELECT * FROM registration_pending
           WHERE NOT consumed AND confirm_method = 'email' AND email = $1
           ORDER BY last_sent_at DESC LIMIT 1`
        : `SELECT * FROM registration_pending
           WHERE NOT consumed AND confirm_method = 'phone' AND phone = $1
           ORDER BY last_sent_at DESC LIMIT 1`,
      [method === "email" ? email : phone],
    );
    const raw = rows[0] as Record<string, unknown> | undefined;
    return raw ? rowFromPg(raw) : null;
  }
  const list = await readJsonFile<PendingRegistration[]>(REQUESTS_PATH, []);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const r = list[i];
    if (!r.consumed && r.confirmMethod === method && idForRow(r, method) === identifier) return r;
  }
  return null;
}

export async function registrationFindActive(
  method: ConfirmMethod,
  identifier: string,
): Promise<PendingRegistration | null> {
  return registrationFindLatestForCooldown(method, identifier);
}

export async function registrationBumpAttempts(id: string): Promise<void> {
  if (usesPostgres()) {
    await getPool().query(
      `UPDATE registration_pending SET attempts = attempts + 1 WHERE id = $1`,
      [id],
    );
    return;
  }
  const list = await readJsonFile<PendingRegistration[]>(REQUESTS_PATH, []);
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  list[idx].attempts += 1;
  await writeJsonFile(REQUESTS_PATH, list);
}

export async function registrationMarkConsumed(id: string): Promise<void> {
  if (usesPostgres()) {
    await getPool().query(`UPDATE registration_pending SET consumed = TRUE WHERE id = $1`, [id]);
    return;
  }
  const list = await readJsonFile<PendingRegistration[]>(REQUESTS_PATH, []);
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  list[idx].consumed = true;
  await writeJsonFile(REQUESTS_PATH, list);
}
