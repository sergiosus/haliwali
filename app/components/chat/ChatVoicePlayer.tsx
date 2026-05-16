"use client";

import { useEffect, useRef, useState } from "react";

export function ChatVoicePlayer({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <div className="mt-1 flex min-w-0 max-w-full items-center gap-2">
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-sm font-semibold text-black/75 hover:bg-black/[0.03]"
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
        }}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="min-w-0 truncate text-xs text-black/55">{label ?? "Голосовое"}</span>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="none" className="hidden" />
    </div>
  );
}
