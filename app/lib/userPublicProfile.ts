export function publicUserProfilePath(userId: string): string {
  const id = (userId ?? "").trim();
  if (!id) return "/account";
  return `/users/${encodeURIComponent(id)}`;
}
