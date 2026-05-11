"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BackNavButton } from "../../components/BackNavButton";
import { CompactListingCard } from "../../components/CompactListingCard";
import { useAuth } from "../../lib/auth";
import type { Listing } from "../../lib/listings";
import { listingPath } from "../../lib/seo";
import { appendReturnUrlQuery } from "../../lib/returnNavigation";

type PublicUser = {
  userId: string;
  displayName?: string;
  identityLabel?: string;
  name?: string;
  activeListingCount?: number;
};

export default function PublicUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = decodeURIComponent((params?.userId ?? "").trim());
  const auth = useAuth();
  const currentUserId = auth.status === "ready" ? (auth.userId ?? "").trim() : "";
  const isSelf = Boolean(userId && currentUserId && userId === currentUserId);

  const [user, setUser] = useState<PublicUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      fetch(`/api/users/${encodeURIComponent(userId)}/public`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/users/${encodeURIComponent(userId)}/listings`, { credentials: "include", cache: "no-store" }),
    ])
      .then(async ([userRes, listingsRes]) => {
        if (cancelled) return;
        if (!userRes.ok) {
          setUser(null);
          setListings([]);
          setError("Пользователь не найден");
          return;
        }
        const userData = (await userRes.json()) as PublicUser;
        const listingsData = listingsRes.ok ? ((await listingsRes.json()) as { listings?: Listing[] }) : { listings: [] };
        setUser(userData);
        setListings(Array.isArray(listingsData.listings) ? listingsData.listings : []);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setListings([]);
          setError("Не удалось загрузить профиль");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const displayName = useMemo(() => {
    const label = (user?.identityLabel ?? user?.displayName ?? user?.name ?? "").trim();
    return label || "Пользователь";
  }, [user]);

  const returnHref = `/users/${encodeURIComponent(userId)}`;

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
        <BackNavButton className="text-sm text-black/60 hover:text-black" />
        {loading ? <p className="mt-6 text-sm text-black/60">Загрузка…</p> : null}
        {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && user ? (
          <section className="mt-4 space-y-5">
            <header className="rounded-3xl border border-black/10 bg-white p-5">
              <h1 className="text-xl font-semibold tracking-tight">{isSelf ? "Вы" : displayName}</h1>
              <p className="mt-1 text-sm text-black/60">
                {isSelf ? "Ваш публичный профиль" : "Публичный профиль продавца"}
              </p>
              <p className="mt-2 text-sm text-black/55">
                Опубликованных объявлений: <span className="font-medium text-black/80">{listings.length}</span>
              </p>
              {isSelf ? (
                <Link href="/account" className="mt-3 inline-flex text-sm font-medium text-orange-600 hover:text-orange-700">
                  Перейти в кабинет
                </Link>
              ) : null}
            </header>

            {listings.length > 0 ? (
              <section className="grid gap-4 md:grid-cols-2">
                {listings.map((l) => (
                  <CompactListingCard
                    key={l.id}
                    listing={l}
                    href={appendReturnUrlQuery(listingPath(l.id, l.title), returnHref)}
                    publicAuthor={{
                      identityLabel: user.identityLabel,
                      displayName: user.displayName,
                      name: user.name,
                    }}
                  />
                ))}
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-5 text-sm text-black/60">
                У пользователя пока нет опубликованных объявлений.
              </section>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
