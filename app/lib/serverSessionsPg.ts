import { getPool } from "./pgPool";

export async function pgSessionInsert(
  token: string,
  userId: string,
  createdAt: number,
  expiresAt: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, userId, createdAt, expiresAt],
  );
}

export async function pgSessionDelete(token: string): Promise<void> {
  const t = (token ?? "").trim();
  if (!t) return;
  await getPool().query(`DELETE FROM auth_sessions WHERE token = $1`, [t]);
}

export async function pgSessionDeleteAllForUser(userId: string): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(`DELETE FROM auth_sessions WHERE user_id = $1`, [id]);
}

export async function pgSessionGetUserId(token: string): Promise<string | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  const now = Date.now();
  const { rows } = await getPool().query<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM auth_sessions WHERE token = $1`,
    [t],
  );
  const rec = rows[0];
  if (!rec) return null;
  if (Number(rec.expires_at) <= now) {
    await pgSessionDelete(t);
    return null;
  }
  return rec.user_id;
}
