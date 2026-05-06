import { NextResponse } from "next/server";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { normalizeEmail } from "../../../lib/identity";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";
import { createPasswordResetIfUserExists } from "../../../lib/serverPasswordReset";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const RL_IP_PATH = path.join(DATA_DIR, "forgot-password-ip-rate.json");
const RL_KEY_PATH = path.join(DATA_DIR, "forgot-password-ip-email-rate.json");
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

async function checkKeyRateLimit(key: string): Promise<{ ok: boolean }> {
  const safeKey = key.trim() || "unknown";
  // Reuse IP limiter storage format (map key -> timestamps).
  const res = await checkIpRateLimit({ path: RL_KEY_PATH, ip: safeKey, limit: LIMIT, windowMs: WINDOW_MS });
  return { ok: res.ok };
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  await mkdir(DATA_DIR, { recursive: true });

  const ip = extractIp(req);
  const rlIp = await checkIpRateLimit({ path: RL_IP_PATH, ip, limit: LIMIT, windowMs: WINDOW_MS });
  if (!rlIp.ok) {
    return NextResponse.json({ ok: true });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");

  // Always hide existence: always respond ok.
  if (email) {
    const rlKey = await checkKeyRateLimit(`${ip}|${email}`);
    if (rlKey.ok) {
      await createPasswordResetIfUserExists({ email, expiresInMs: 20 * 60 * 1000 });
    }
  }

  return NextResponse.json({ ok: true });
}

