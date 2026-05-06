import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

export type CallStatus = "pending" | "active" | "ended" | "declined" | "missed";

export type StoredCall = {
  callId: string;
  chatId: string;
  roomToken: string;
  callerId: string;
  /** Отображаемое имя звонящего для входящего модального окна */
  callerDisplayName?: string;
  participantIds: string[];
  createdAt: number;
  expiresAt: number;
  status: CallStatus;
  updatedAt: number;
  /** JSON RTCSessionDescriptionInit offer */
  offerJson?: string;
  /** JSON RTCSessionDescriptionInit answer */
  answerJson?: string;
  /** JSON.stringify(RTCIceCandidateInit) от звонящего */
  iceFromCaller?: string[];
  /** JSON.stringify(RTCIceCandidateInit) от принимающего */
  iceFromCallee?: string[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const CALLS_PATH = path.join(DATA_DIR, "calls.json");

type CallsDb = Record<string, StoredCall>;

function uniqueIds(ids: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const v = String(id ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/* ─── JSON fallback (when DATABASE_URL is unset) ─── */

async function readFileDb(): Promise<CallsDb> {
  assertFileStoreNotUsedInProduction("serverCallsStore.readFileDb", { path: CALLS_PATH });
  try {
    const raw = await readFile(CALLS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CallsDb;
  } catch {
    return {};
  }
}

async function writeFileDb(next: CallsDb) {
  assertFileStoreNotUsedInProduction("serverCallsStore.writeFileDb", { path: CALLS_PATH });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CALLS_PATH, JSON.stringify(next, null, 2), "utf8");
}

/* ─── PostgreSQL ─── */

type AudioCallRow = {
  call_id: string;
  chat_id: string;
  room_token: string;
  caller_id: string;
  caller_display_name: string | null;
  participant_ids: string[];
  status: CallStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
  offer_json: string | null;
  answer_json: string | null;
  ice_from_caller: string[] | null;
  ice_from_callee: string[] | null;
};

function rowToStoredCall(r: AudioCallRow): StoredCall {
  return {
    callId: r.call_id,
    chatId: r.chat_id,
    roomToken: r.room_token,
    callerId: r.caller_id,
    ...(r.caller_display_name != null && String(r.caller_display_name).trim()
      ? { callerDisplayName: String(r.caller_display_name).trim() }
      : {}),
    participantIds: Array.isArray(r.participant_ids) ? r.participant_ids : [],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    expiresAt: Number(r.expires_at),
    status: r.status,
    ...(r.offer_json != null && String(r.offer_json) !== "" ? { offerJson: r.offer_json } : {}),
    ...(r.answer_json != null && String(r.answer_json) !== "" ? { answerJson: r.answer_json } : {}),
    iceFromCaller: Array.isArray(r.ice_from_caller) ? r.ice_from_caller : [],
    iceFromCallee: Array.isArray(r.ice_from_callee) ? r.ice_from_callee : [],
  };
}

async function persistStoredCall(client: PoolClient, c: StoredCall): Promise<void> {
  await client.query(
    `INSERT INTO audio_calls (
      call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
      status, created_at, updated_at, expires_at,
      offer_json, answer_json, ice_from_caller, ice_from_callee
    ) VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13::text[],$14::text[])
    ON CONFLICT (call_id) DO UPDATE SET
      chat_id = EXCLUDED.chat_id,
      room_token = EXCLUDED.room_token,
      caller_id = EXCLUDED.caller_id,
      caller_display_name = EXCLUDED.caller_display_name,
      participant_ids = EXCLUDED.participant_ids,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      expires_at = EXCLUDED.expires_at,
      offer_json = EXCLUDED.offer_json,
      answer_json = EXCLUDED.answer_json,
      ice_from_caller = EXCLUDED.ice_from_caller,
      ice_from_callee = EXCLUDED.ice_from_callee`,
    [
      c.callId,
      c.chatId,
      c.roomToken,
      c.callerId,
      (c.callerDisplayName ?? "").trim() || null,
      c.participantIds,
      c.status,
      c.createdAt,
      c.updatedAt,
      c.expiresAt,
      c.offerJson ?? null,
      c.answerJson ?? null,
      c.iceFromCaller ?? [],
      c.iceFromCallee ?? [],
    ],
  );
}

const MAX_ICE_PER_SIDE = 96;

export async function findActiveOrPendingCall(chatId: string, userId: string): Promise<StoredCall | null> {
  const cid = chatId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return null;
  const now = Date.now();

  if (usesPostgres()) {
    const { rows } = await getPool().query<AudioCallRow>(
      `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
              status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
       FROM audio_calls
       WHERE chat_id = $1 AND expires_at > $2 AND status IN ('pending', 'active') AND $3 = ANY(participant_ids)
       LIMIT 1`,
      [cid, now, uid],
    );
    const r = rows[0];
    return r ? rowToStoredCall(r) : null;
  }

  const db = await readFileDb();
  for (const c of Object.values(db)) {
    if (!c || c.chatId !== cid) continue;
    if (c.expiresAt <= now) continue;
    if (c.status !== "pending" && c.status !== "active") continue;
    if (!Array.isArray(c.participantIds) || !c.participantIds.includes(uid)) continue;
    return c;
  }
  return null;
}

export async function createCall(opts: {
  chatId: string;
  callerId: string;
  participantIds: string[];
  ttlMs?: number;
  callerDisplayName?: string;
}): Promise<StoredCall> {
  const now = Date.now();
  const ttlMs = typeof opts.ttlMs === "number" && opts.ttlMs > 0 ? opts.ttlMs : 30 * 60_000;
  const nm = (opts.callerDisplayName ?? "").trim();
  const call: StoredCall = {
    callId: randomUUID(),
    chatId: opts.chatId,
    roomToken: randomUUID(),
    callerId: opts.callerId,
    ...(nm ? { callerDisplayName: nm } : {}),
    participantIds: uniqueIds(opts.participantIds),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
    status: "pending",
    iceFromCaller: [],
    iceFromCallee: [],
  };

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await persistStoredCall(client, call);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return call;
  }

  const db = await readFileDb();
  db[call.callId] = call;
  await writeFileDb(db);
  return call;
}

export async function getCall(callId: string): Promise<StoredCall | null> {
  const id = callId.trim();
  if (!id) return null;

  if (usesPostgres()) {
    const { rows } = await getPool().query<AudioCallRow>(
      `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
              status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
       FROM audio_calls WHERE call_id = $1 LIMIT 1`,
      [id],
    );
    const r = rows[0];
    return r ? rowToStoredCall(r) : null;
  }

  const db = await readFileDb();
  const c = db[id];
  return c && typeof c === "object" ? c : null;
}

/** Входящий ожидающий звонок для пользователя (не инициатор). */
export async function findIncomingPendingForUser(userId: string): Promise<StoredCall | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const now = Date.now();

  if (usesPostgres()) {
    const { rows } = await getPool().query<AudioCallRow>(
      `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
              status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
       FROM audio_calls
       WHERE expires_at > $1 AND status = 'pending' AND caller_id <> $2 AND $2 = ANY(participant_ids)
       ORDER BY created_at DESC
       LIMIT 1`,
      [now, uid],
    );
    const r = rows[0];
    return r ? rowToStoredCall(r) : null;
  }

  const db = await readFileDb();
  let best: StoredCall | null = null;
  for (const c of Object.values(db)) {
    if (!c || c.expiresAt <= now) continue;
    if (c.status !== "pending") continue;
    if (c.callerId === uid) continue;
    if (!Array.isArray(c.participantIds) || !c.participantIds.includes(uid)) continue;
    if (!best || c.createdAt > best.createdAt) best = c;
  }
  return best;
}

/** Отмена исходящего звонка (только инициатор, только pending). */
export async function cancelPendingCall(callId: string, callerId: string): Promise<boolean> {
  const cid = callId.trim();
  const uid = callerId.trim();
  if (!cid || !uid) return false;

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<AudioCallRow>(
        `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
                status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
         FROM audio_calls WHERE call_id = $1 FOR UPDATE`,
        [cid],
      );
      const r = rows[0];
      if (!r) {
        await client.query("ROLLBACK");
        return false;
      }
      const c = rowToStoredCall(r);
      if (c.callerId !== uid || c.status !== "pending") {
        await client.query("ROLLBACK");
        return false;
      }
      const next: StoredCall = {
        ...c,
        status: "ended",
        updatedAt: Date.now(),
      };
      await persistStoredCall(client, next);
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const c = await getCall(cid);
  if (!c || c.callerId !== uid) return false;
  if (c.status !== "pending") return false;
  await updateCall(cid, { status: "ended" });
  return true;
}

export async function setCallOfferJson(callId: string, offerJson: string): Promise<boolean> {
  const id = callId.trim();
  if (!id) return false;

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<AudioCallRow>(
        `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
                status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
         FROM audio_calls WHERE call_id = $1 FOR UPDATE`,
        [id],
      );
      const r = rows[0];
      if (!r) {
        await client.query("ROLLBACK");
        return false;
      }
      const c = rowToStoredCall(r);
      if (c.status === "ended" || c.status === "declined") {
        await client.query("ROLLBACK");
        return false;
      }
      const next: StoredCall = { ...c, offerJson, updatedAt: Date.now() };
      await persistStoredCall(client, next);
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const c = await getCall(id);
  if (!c || c.status === "ended" || c.status === "declined") return false;
  await updateCall(id, { offerJson });
  return true;
}

export async function setCallAnswerJson(callId: string, answerJson: string): Promise<boolean> {
  const id = callId.trim();
  if (!id) return false;

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<AudioCallRow>(
        `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
                status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
         FROM audio_calls WHERE call_id = $1 FOR UPDATE`,
        [id],
      );
      const r = rows[0];
      if (!r) {
        await client.query("ROLLBACK");
        return false;
      }
      const c = rowToStoredCall(r);
      if (c.status === "ended" || c.status === "declined") {
        await client.query("ROLLBACK");
        return false;
      }
      const next: StoredCall = { ...c, answerJson, updatedAt: Date.now() };
      await persistStoredCall(client, next);
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const c = await getCall(id);
  if (!c || c.status === "ended" || c.status === "declined") return false;
  await updateCall(id, { answerJson });
  return true;
}

export async function appendIceCandidate(callId: string, role: "caller" | "callee", candidateJson: string): Promise<boolean> {
  const cid = callId.trim();
  if (!cid) return false;

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<AudioCallRow>(
        `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
                status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
         FROM audio_calls WHERE call_id = $1 FOR UPDATE`,
        [cid],
      );
      const r = rows[0];
      if (!r) {
        await client.query("ROLLBACK");
        return false;
      }
      const c = rowToStoredCall(r);
      if (c.status === "ended" || c.status === "declined") {
        await client.query("ROLLBACK");
        return false;
      }
      const key = role === "caller" ? "iceFromCaller" : "iceFromCallee";
      const prev = Array.isArray(c[key]) ? [...c[key]!] : [];
      if (prev.length >= MAX_ICE_PER_SIDE) {
        await client.query("COMMIT");
        return true;
      }
      prev.push(candidateJson);
      const next: StoredCall = {
        ...c,
        updatedAt: Date.now(),
        [key]: prev,
      } as StoredCall;
      await persistStoredCall(client, next);
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const c = await getCall(cid);
  if (!c || c.status === "ended" || c.status === "declined") return false;
  const key = role === "caller" ? "iceFromCaller" : "iceFromCallee";
  const prev = Array.isArray(c[key]) ? [...c[key]!] : [];
  if (prev.length >= MAX_ICE_PER_SIDE) return true;
  prev.push(candidateJson);
  await updateCall(cid, { [key]: prev } as Partial<StoredCall>);
  return true;
}

export async function updateCall(callId: string, patch: Partial<StoredCall>): Promise<StoredCall | null> {
  const id = callId.trim();
  if (!id) return null;

  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<AudioCallRow>(
        `SELECT call_id, chat_id, room_token, caller_id, caller_display_name, participant_ids,
                status, created_at, updated_at, expires_at, offer_json, answer_json, ice_from_caller, ice_from_callee
         FROM audio_calls WHERE call_id = $1 FOR UPDATE`,
        [id],
      );
      const r = rows[0];
      if (!r) {
        await client.query("ROLLBACK");
        return null;
      }
      const existing = rowToStoredCall(r);
      const next: StoredCall = {
        ...existing,
        ...patch,
        callId: existing.callId,
        chatId: existing.chatId,
        updatedAt: Date.now(),
      };
      await persistStoredCall(client, next);
      await client.query("COMMIT");
      return next;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const db = await readFileDb();
  const existing = db[id];
  if (!existing) return null;
  const next: StoredCall = {
    ...existing,
    ...patch,
    callId: existing.callId,
    chatId: existing.chatId,
    updatedAt: Date.now(),
  };
  db[id] = next;
  await writeFileDb(db);
  return next;
}
