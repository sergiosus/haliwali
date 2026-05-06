import { NextResponse } from "next/server";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";
import { consumePasswordResetToken } from "../../../lib/serverPasswordReset";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const RL_IP_PATH = path.join(DATA_DIR, "reset-password-ip-rate.json");
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  await mkdir(DATA_DIR, { recursive: true });

  const ip = extractIp(req);
  const rlIp = await checkIpRateLimit({ path: RL_IP_PATH, ip, limit: LIMIT, windowMs: WINDOW_MS });
  if (!rlIp.ok) {
    return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    newPassword?: unknown;
  };

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!token || newPassword.trim().length < 8) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const newPasswordHash = await bcrypt.hash(newPassword.trim(), 10);
  const res = await consumePasswordResetToken({ rawToken: token, newPasswordHash });
  if (!res.ok) {
    if (res.error === "EXPIRED" || res.error === "BAD_TOKEN") {
      return NextResponse.json({ error: "BAD_TOKEN" }, { status: 400 });
    }
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

