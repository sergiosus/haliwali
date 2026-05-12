import type { StoredUser } from "./serverUsersStore";
import { normalizeEmail, normalizePhone } from "./identity";
import { getPool } from "./pgPool";

type UsersDbShape = {
  usersById: Record<string, StoredUser>;
  emailIndex: Record<string, string>;
  phoneIndex: Record<string, string>;
};

const USER_SELECT_SQL = `SELECT user_id, email, phone, password_hash, phone_visible, created_at, last_seen_at,
            COALESCE(deletion_status, '') AS deletion_status,
            delete_requested_at, delete_scheduled_at,
            COALESCE(full_name, '') AS full_name,
            COALESCE(public_display_name, '') AS public_display_name,
            deleted_at, deleted_by_user_id, delete_reason, purge_after, purged_at
     FROM users`;

function tsFromPg(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function mapPgUserRow(r: {
  user_id: string;
  email: string;
  phone: string;
  password_hash: string | null;
  phone_visible: boolean;
  created_at: string;
  last_seen_at: string | null;
  deletion_status: string;
  delete_requested_at: string | null;
  delete_scheduled_at: string | null;
  full_name: string | null;
  public_display_name: string | null;
  deleted_at?: Date | string | null;
  deleted_by_user_id?: string | null;
  delete_reason?: string | null;
  purge_after?: Date | string | null;
  purged_at?: Date | string | null;
}): StoredUser {
  const email = normalizeEmail(r.email ?? "");
  const phone = normalizePhone(r.phone ?? "");
  const rawDs = (r.deletion_status ?? "").trim();
  const createdAt = Number(r.created_at);
  const fullNameTrim = ((r.full_name ?? "") as string).trim();
  const publicDisplayTrim = ((r.public_display_name ?? "") as string).trim();
  const softDeletedAt = tsFromPg(r.deleted_at);
  const purgeAfter = tsFromPg(r.purge_after);
  const purgedAt = tsFromPg(r.purged_at);
  const deletedByUserId = (r.deleted_by_user_id ?? "").trim();
  const deleteReason = (r.delete_reason ?? "").trim();
  return {
    userId: r.user_id,
    email,
    phone,
    phoneVisible: Boolean(r.phone_visible),
    passwordHash: (r.password_hash ?? "").trim(),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    lastSeenAt: r.last_seen_at != null ? Number(r.last_seen_at) : undefined,
    deletionStatus: rawDs === "pending_deletion" || rawDs === "deleted" ? rawDs : "",
    ...(fullNameTrim ? { name: fullNameTrim } : {}),
    ...(publicDisplayTrim ? { displayName: publicDisplayTrim } : {}),
    ...(r.delete_requested_at != null ? { deleteRequestedAt: Number(r.delete_requested_at) } : {}),
    ...(r.delete_scheduled_at != null ? { deleteScheduledAt: Number(r.delete_scheduled_at) } : {}),
    ...(softDeletedAt != null ? { softDeletedAt } : {}),
    ...(purgeAfter != null ? { purgeAfter } : {}),
    ...(purgedAt != null ? { purgedAt } : {}),
    ...(deletedByUserId ? { deletedByUserId } : {}),
    ...(deleteReason ? { deleteReason } : {}),
  };
}

/** Single-user fetch (avoids loading entire table; correct source for password change). */
export async function pgFetchUserById(userId: string): Promise<StoredUser | null> {
  const id = (userId ?? "").trim();
  if (!id) return null;
  const { rows } = await getPool().query<{
    user_id: string;
    email: string;
    phone: string;
    password_hash: string | null;
    phone_visible: boolean;
    created_at: string;
    last_seen_at: string | null;
    deletion_status: string;
    delete_requested_at: string | null;
    delete_scheduled_at: string | null;
    full_name: string | null;
    public_display_name: string | null;
    deleted_at: Date | string | null;
    deleted_by_user_id: string | null;
    delete_reason: string | null;
    purge_after: Date | string | null;
    purged_at: Date | string | null;
  }>(`${USER_SELECT_SQL} WHERE user_id = $1 LIMIT 1`, [id]);
  const r = rows[0];
  if (!r) return null;
  return mapPgUserRow(r);
}

/** Row shape for admin checks (`users.is_admin`, legacy `users.role`). */
export type PgUserAdminRow = { user_id: string; is_admin: boolean; role: string };

/**
 * Load admin flags for the session user. Expects PostgreSQL columns `is_admin` and `role`
 * on `users` when using this app in production with DB-backed admins.
 */
export async function pgFetchUserAdminPrivileges(userId: string): Promise<PgUserAdminRow | null> {
  const id = (userId ?? "").trim();
  if (!id) return null;
  const { rows } = await getPool().query<{
    user_id: string;
    is_admin: boolean | null;
    role: string | null;
  }>(
    `SELECT user_id,
            COALESCE(is_admin, FALSE) AS is_admin,
            COALESCE(TRIM(role), '') AS role
     FROM users
     WHERE user_id = $1
     LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    user_id: r.user_id,
    is_admin: Boolean(r.is_admin),
    role: (r.role ?? "").trim(),
  };
}

export async function pgLoadUsersDb(): Promise<UsersDbShape> {
  const { rows } = await getPool().query<{
    user_id: string;
    email: string;
    phone: string;
    password_hash: string;
    phone_visible: boolean;
    created_at: string;
    last_seen_at: string | null;
    deletion_status: string;
    delete_requested_at: string | null;
    delete_scheduled_at: string | null;
    full_name: string | null;
    public_display_name: string | null;
    deleted_at: Date | string | null;
    deleted_by_user_id: string | null;
    delete_reason: string | null;
    purge_after: Date | string | null;
    purged_at: Date | string | null;
  }>(USER_SELECT_SQL);

  const usersById: Record<string, StoredUser> = {};
  const emailIndex: Record<string, string> = {};
  const phoneIndex: Record<string, string> = {};

  for (const r of rows) {
    const u = mapPgUserRow(r);
    usersById[u.userId] = u;
    if (u.email) emailIndex[u.email] = u.userId;
    if (u.phone) phoneIndex[u.phone] = u.userId;
  }

  return { usersById, emailIndex, phoneIndex };
}

export async function pgInsertUser(user: StoredUser): Promise<void> {
  const email = normalizeEmail(user.email ?? "");
  const phone = normalizePhone(user.phone ?? "");
  await getPool().query(
    `INSERT INTO users (user_id, email, phone, password_hash, phone_visible, created_at, last_seen_at,
      deletion_status, delete_requested_at, delete_scheduled_at, full_name, public_display_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', NULL, NULL, $8, $9)`,
    [
      user.userId,
      email,
      phone,
      user.passwordHash,
      Boolean(user.phoneVisible),
      user.createdAt,
      user.lastSeenAt ?? null,
      (user.name ?? "").trim(),
      (user.displayName ?? "").trim(),
    ],
  );
}

export async function pgSetPendingDeletion(args: {
  userId: string;
  requestedAt: number;
  scheduledAt: number;
}): Promise<void> {
  const id = (args.userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users SET deletion_status = 'pending_deletion', delete_requested_at = $2, delete_scheduled_at = $3
     WHERE user_id = $1`,
    [id, args.requestedAt, args.scheduledAt],
  );
}

export async function pgClearDeletionSchedule(userId: string): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users SET deletion_status = '', delete_requested_at = NULL, delete_scheduled_at = NULL WHERE user_id = $1`,
    [id],
  );
}

export async function pgAnonymizeUser(userId: string, newPasswordHash: string, erasedAt: number): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users SET
       email = '', phone = '',
       password_hash = $2,
       phone_visible = FALSE,
       deletion_status = 'deleted',
       delete_requested_at = $3,
       delete_scheduled_at = NULL,
       last_seen_at = NULL,
       full_name = '',
       public_display_name = ''
     WHERE user_id = $1`,
    [id, newPasswordHash, erasedAt],
  );
}

export async function pgUpdateLastSeen(userId: string, ts: number): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(`UPDATE users SET last_seen_at = $2 WHERE user_id = $1`, [id, ts]);
}

export async function pgUpdateUserFullName(userId: string, fullName: string): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) throw new Error("BAD_INPUT");
  const fn = (fullName ?? "").trim();
  const res = await getPool().query(`UPDATE users SET full_name = $2 WHERE user_id = $1`, [id, fn]);
  if ((res.rowCount ?? 0) < 1) throw new Error("USER_NOT_UPDATED");
}

export async function pgUpdatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  const id = (userId ?? "").trim();
  const hash = (passwordHash ?? "").trim();
  if (!id || !hash) throw new Error("BAD_INPUT");
  const res = await getPool().query(`UPDATE users SET password_hash = $2 WHERE user_id = $1`, [id, hash]);
  if ((res.rowCount ?? 0) < 1) throw new Error("USER_NOT_UPDATED");
}

export async function pgHasEmailOrPhone(emailRaw: string, phoneRaw: string): Promise<boolean> {
  const email = normalizeEmail(emailRaw);
  const phone = normalizePhone(phoneRaw);
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM users
     WHERE deleted_at IS NULL
       AND purged_at IS NULL
       AND COALESCE(deletion_status, '') <> 'deleted'
       AND (($1::text <> '' AND email = $1) OR ($2::text <> '' AND phone = $2))
     LIMIT 1`,
    [email, phone],
  );
  return (rowCount ?? 0) > 0;
}

export async function pgCountActivePrivilegedAdmins(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM users
     WHERE deleted_at IS NULL
       AND purged_at IS NULL
       AND COALESCE(deletion_status, '') <> 'deleted'
       AND (COALESCE(is_admin, FALSE) OR COALESCE(TRIM(role), '') = 'admin')`,
  );
  const n = Number(rows[0]?.c ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function pgSoftDeleteUser(args: {
  userId: string;
  deletedByUserId: string;
  reason?: string;
}): Promise<void> {
  const id = (args.userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users
     SET deleted_at = NOW(),
         purge_after = NOW() + INTERVAL '10 days',
         deleted_by_user_id = $2,
         delete_reason = $3
     WHERE user_id = $1`,
    [id, args.deletedByUserId, (args.reason ?? "").trim() || null],
  );
}

export async function pgRestoreSoftDeletedUser(userId: string): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users
     SET deleted_at = NULL,
         purge_after = NULL,
         purged_at = NULL,
         delete_reason = NULL,
         deleted_by_user_id = NULL
     WHERE user_id = $1`,
    [id],
  );
}

export async function pgPurgeSoftDeletedUser(userId: string, newPasswordHash: string, erasedAt: number): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  await getPool().query(
    `UPDATE users SET
       email = '',
       phone = '',
       password_hash = $2,
       phone_visible = FALSE,
       deletion_status = 'deleted',
       delete_requested_at = $3,
       delete_scheduled_at = NULL,
       last_seen_at = NULL,
       full_name = '',
       public_display_name = $4,
       purged_at = NOW()
     WHERE user_id = $1`,
    [id, newPasswordHash, erasedAt, "Пользователь удалён"],
  );
}

export function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
