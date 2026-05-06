"use client";

import { useRouter } from "next/navigation";

export function BackNavButton({ className, home = false }: { className?: string; home?: boolean }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (home) {
          router.push("/");
          return;
        }
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
      className={className}
    >
      {home ? "← На главную" : "← Назад"}
    </button>
  );
}

