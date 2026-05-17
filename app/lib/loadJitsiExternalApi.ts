"use client";

import { JITSI_DOMAIN } from "./jitsiRoomName";

export type JitsiMeetExternalApi = {
  dispose: () => void;
  executeCommand: (name: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (payload?: unknown) => void) => void;
  on?: (event: string, handler: (payload?: unknown) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>,
    ) => JitsiMeetExternalApi;
  }
}

const scriptPromises = new Map<string, Promise<void>>();

export function jitsiExternalApiScriptUrl(domain: string = JITSI_DOMAIN): string {
  return `https://${domain}/external_api.js`;
}

export function loadJitsiExternalApi(domain: string = JITSI_DOMAIN): Promise<void> {
  const cached = scriptPromises.get(domain);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no_window"));
      return;
    }
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const src = jitsiExternalApiScriptUrl(domain);
    const existing = document.querySelector<HTMLScriptElement>(`script[data-haliwali-jitsi="${domain}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("jitsi_script_load_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.haliwaliJitsi = domain;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("jitsi_script_load_failed"));
    document.head.appendChild(script);
  }).then(() => {
    if (!window.JitsiMeetExternalAPI) {
      throw new Error("jitsi_api_missing");
    }
  });

  scriptPromises.set(domain, promise);
  return promise;
}
