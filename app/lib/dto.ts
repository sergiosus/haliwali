import type { AccountDeletionStatus, StoredUser } from "./serverUsersStore";

export type UserPublicDTO = {
  userId: string;
  createdAt: number;
};

export type UserPrivateDTO = {
  userId: string;
  createdAt: number;
  email: string;
  phone: string;
  phoneVisible: boolean;
  deletionStatus: AccountDeletionStatus;
  deleteRequestedAt: number | null;
  deleteScheduledAt: number | null;
  /** Persisted profile name (empty string if cleared). */
  name: string;
  /** Optional chosen display handle (usually empty unless set server-side). */
  displayName: string;
};

export function toUserPublicDTO(u: StoredUser): UserPublicDTO {
  return { userId: u.userId, createdAt: u.createdAt };
}

export function toUserPrivateDTO(u: StoredUser): UserPrivateDTO {
  const ds: AccountDeletionStatus =
    u.deletionStatus === "pending_deletion" || u.deletionStatus === "deleted" ? u.deletionStatus : "";
  return {
    userId: u.userId,
    createdAt: u.createdAt,
    email: u.email,
    phone: u.phone,
    phoneVisible: Boolean(u.phoneVisible),
    deletionStatus: ds,
    deleteRequestedAt: typeof u.deleteRequestedAt === "number" ? u.deleteRequestedAt : null,
    deleteScheduledAt: typeof u.deleteScheduledAt === "number" ? u.deleteScheduledAt : null,
    name: typeof u.name === "string" ? u.name.trim() : "",
    displayName: typeof u.displayName === "string" ? u.displayName.trim() : "",
  };
}

