import { useMemo } from "react";

export function GeolocationButton({
  loading,
  onClick,
  className = "",
}: {
  loading: boolean;
  onClick: () => void;
  className?: string;
}) {
  const cls = useMemo(() => {
    const base =
      "pointer-events-auto absolute right-4 bottom-4 z-20 " +
      "flex h-11 w-11 items-center justify-center rounded-full " +
      "border border-black/10 bg-white text-[18px] shadow-[0_6px_18px_rgba(0,0,0,0.18)] " +
      "hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-70";
    return className.trim() ? `${base} ${className.trim()}` : base;
  }, [className]);

  return (
    <button type="button" aria-label="Моё местоположение" disabled={loading} onClick={onClick} className={cls}>
      {loading ? (
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-black/25 border-t-orange-500"
          aria-hidden
        />
      ) : (
        <span aria-hidden>📍</span>
      )}
    </button>
  );
}

