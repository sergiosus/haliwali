"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isLoggedIn, subscribeAuth, useAuth } from "../lib/auth";
import { isFavorite, subscribeFavorites, toggleFavorite } from "../lib/favorites";

function HeartFilled({ className }: { className?: string }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      />
    </svg>
  );
}

function HeartOutline({ className }: { className?: string }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function ListingFavoriteButton({
  listingId,
  className,
}: {
  listingId: string;
  className?: string;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    function sync() {
      const uid = auth.status === "ready" ? auth.userId ?? "" : "";
      setActive(uid ? isFavorite(uid, listingId) : false);
    }
    sync();
    if (typeof window === "undefined") return;
    const offFav = subscribeFavorites(sync);
    const offAuth = subscribeAuth(sync);
    return () => {
      offFav();
      offAuth();
    };
  }, [listingId, auth.status, auth.userId]);

  return (
    <button
      type="button"
      onClick={() => {
        if (!isLoggedIn()) {
          const next =
            typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.search}`
              : "/";
          router.push(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        const uid = auth.userId ?? "";
        if (!uid) return;
        const next = toggleFavorite(uid, listingId);
        setActive(next);
      }}
      className={[
        "group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white p-0 transition-colors",
        active
          ? "border-[#ff7a00]/40 text-[#ff5a00] hover:bg-[#fff1e8]"
          : "border-black/10 text-neutral-400 hover:bg-black/[0.04] hover:text-neutral-600",
        className ?? "",
      ].join(" ")}
      aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}
      title={active ? "Убрать из избранного" : "Добавить в избранное"}
    >
      <span className="inline-flex shrink-0 items-center justify-center transition-transform duration-150 group-hover:scale-[1.08]">
        {active ? <HeartFilled /> : <HeartOutline />}
      </span>
    </button>
  );
}
