import { redirect } from "next/navigation";

export default async function AdRedirectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const slug = (id ?? "").trim();
  redirect(slug ? `/listing/${encodeURIComponent(slug)}` : "/");
}

