"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type JitsiMeetExternalApi,
  loadJitsiExternalApi,
} from "../lib/loadJitsiExternalApi";
import { JITSI_DOMAIN, jitsiRoomNameForChatId } from "../lib/jitsiRoomName";

const CONNECT_TIMEOUT_MS = 45_000;

const JITSI_CONFIG: Record<string, unknown> = {
  prejoinPageEnabled: false,
  prejoinConfig: { enabled: false },
  startAudioOnly: true,
  startWithAudioMuted: false,
  startWithVideoMuted: true,
  requireDisplayName: false,
  enableLobbyChat: false,
  enableNoisyMicDetection: false,
  disableModeratorIndicator: true,
  enableWelcomePage: false,
  disableDeepLinking: true,
  disableRecording: true,
  constraints: { video: false },
  hideLobbyButton: true,
  autoKnockLobby: false,
  enableInsecureRoomNameWarning: false,
  lobby: { autoKnock: false, enableChat: false },
  securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
};

const JITSI_INTERFACE: Record<string, unknown> = {
  TOOLBAR_BUTTONS: ["microphone", "hangup"],
  SHOW_JITSI_WATERMARK: false,
  SHOW_WATERMARK_FOR_GUESTS: false,
  MOBILE_APP_PROMO: false,
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
  HIDE_INVITE_MORE_HEADER: true,
};

const JITSI_ANTI_LOBBY_OVERWRITE: Record<string, unknown> = {
  prejoinPageEnabled: false,
  prejoinConfig: { enabled: false },
  requireDisplayName: false,
  enableLobbyChat: false,
  hideLobbyButton: true,
  autoKnockLobby: false,
  lobby: { autoKnock: false, enableChat: false },
  securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
};

/** Temporary diagnostics for Jitsi integration (remove when stable). */
function jitsiDiag(step: string, data?: unknown) {
  if (data !== undefined) console.info(`[haliwali jitsi] ${step}`, data);
  else console.info(`[haliwali jitsi] ${step}`);
}

function payloadText(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "object") return JSON.stringify(payload);
  return String(payload);
}

function isMembersOnlyError(payload: unknown): boolean {
  const t = payloadText(payload).toLowerCase();
  return (
    t.includes("membersonly") ||
    t.includes("members_only") ||
    t.includes("no moderators") ||
    t.includes("not yet started")
  );
}

function disableLobbyOnApi(api: JitsiMeetExternalApi | null) {
  if (!api) return;
  try {
    api.executeCommand("overwriteConfig", JITSI_ANTI_LOBBY_OVERWRITE);
  } catch {
    /* noop */
  }
  try {
    api.executeCommand("toggleLobby", false);
  } catch {
    /* noop */
  }
}

function applyIframePermissions(container: HTMLElement | null) {
  if (!container) return;
  const iframe = container.querySelector("iframe");
  if (!(iframe instanceof HTMLIFrameElement)) return;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.setAttribute("allow", "microphone; camera; fullscreen; display-capture; autoplay");
  jitsiDiag("iframe_src", iframe.src || "(empty)");
}

export function WebRtcCallModal({
  open,
  callId,
  role,
  peerUserId,
  peerDisplayHint,
  chatId,
  displayName,
  onClose,
}: {
  open: boolean;
  callId: string;
  role: string;
  peerUserId: string;
  peerDisplayHint?: string;
  chatId: string;
  displayName?: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiMeetExternalApi | null>(null);
  const joinedRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [apiLoaded, setApiLoaded] = useState(false);

  const roomName = jitsiRoomNameForChatId(chatId);
  const display = (displayName ?? "").trim() || "Участник";

  const fail = useCallback((message: string) => {
    setStatus("failed");
    setError(message);
    jitsiDiag("failed", message);
  }, []);

  const hangUp = useCallback(() => {
    try {
      apiRef.current?.executeCommand("hangup");
    } catch {
      /* noop */
    }
    try {
      apiRef.current?.dispose();
    } catch {
      /* noop */
    }
    apiRef.current = null;
    joinedRef.current = false;
    window.setTimeout(() => onClose(), 300);
  }, [onClose]);

  const wireApi = useCallback(
    (api: JitsiMeetExternalApi) => {
      const on = (event: string, handler: (payload?: unknown) => void) => {
        if (typeof api.on === "function") api.on(event, handler);
        else api.addListener(event, handler);
      };

      on("videoConferenceJoined", () => {
        joinedRef.current = true;
        setError(null);
        setStatus("connected");
        disableLobbyOnApi(api);
        jitsiDiag("videoConferenceJoined");
      });
      on("participantJoined", (payload) => {
        jitsiDiag("participantJoined", payload);
      });
      on("participantRoleChanged", (payload) => {
        const roleName =
          payload && typeof payload === "object" && "role" in payload
            ? String((payload as { role?: string }).role ?? "")
            : "";
        if (roleName === "moderator") disableLobbyOnApi(api);
      });
      on("micError", (payload) => {
        const msg =
          payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: string }).message ?? "")
            : "";
        fail(msg ? `Микрофон: ${msg}` : "Нет доступа к микрофону в Jitsi.");
      });
      on("errorOccurred", (payload) => {
        jitsiDiag("errorOccurred", payload);
        if (isMembersOnlyError(payload)) {
          disableLobbyOnApi(api);
          fail("Комната недоступна: включён режим ожидания модератора или lobby.");
          return;
        }
        const msg = payloadText(payload);
        fail(msg ? `Ошибка Jitsi: ${msg.slice(0, 160)}` : "Ошибка Jitsi.");
      });
      on("peerConnectionFailure", () => {
        fail("Не удалось установить аудиосоединение.");
      });
      on("readyToClose", () => {
        jitsiDiag("readyToClose", { joined: joinedRef.current });
        if (joinedRef.current) hangUp();
        else fail("Сессия Jitsi завершена до подключения.");
      });
    },
    [fail, hangUp],
  );

  useEffect(() => {
    if (!open) {
      try {
        apiRef.current?.dispose();
      } catch {
        /* noop */
      }
      apiRef.current = null;
      joinedRef.current = false;
      setApiLoaded(false);
      setStatus("connecting");
      setError(null);
      if (containerRef.current) containerRef.current.innerHTML = "";
      return;
    }

    setStatus("connecting");
    setError(null);
    joinedRef.current = false;

    jitsiDiag("init", {
      domain: JITSI_DOMAIN,
      roomName,
      expectedRoomUrl: `https://${JITSI_DOMAIN}/${roomName}`,
    });

    let cancelled = false;
    const iframePoll = window.setInterval(() => {
      if (cancelled) return;
      applyIframePermissions(containerRef.current);
    }, 400);

    void (async () => {
      try {
        await loadJitsiExternalApi(JITSI_DOMAIN);
        if (cancelled) return;
        setApiLoaded(true);
        jitsiDiag("api_loaded", { yes: true });

        const parentNode = containerRef.current;
        if (!parentNode) {
          fail("Не удалось открыть окно звонка.");
          return;
        }
        parentNode.innerHTML = "";

        const ApiCtor = window.JitsiMeetExternalAPI;
        if (!ApiCtor) {
          jitsiDiag("api_loaded", { yes: false });
          fail("Jitsi API не загрузился. Проверьте доступ к meet.haliwali.ru.");
          return;
        }

        const api = new ApiCtor(JITSI_DOMAIN, {
          roomName,
          parentNode,
          width: "100%",
          height: "100%",
          lang: "ru",
          configOverwrite: JITSI_CONFIG,
          interfaceConfigOverwrite: JITSI_INTERFACE,
          userInfo: { displayName: display },
        });

        if (cancelled) {
          try {
            api.dispose();
          } catch {
            /* noop */
          }
          return;
        }

        apiRef.current = api;
        wireApi(api);
        disableLobbyOnApi(api);
        jitsiDiag("api_ready", { domain: JITSI_DOMAIN, roomName });
        window.setTimeout(() => applyIframePermissions(parentNode), 0);
      } catch (e) {
        if (cancelled) return;
        jitsiDiag("api_loaded", { yes: false, error: String(e) });
        fail("Не удалось загрузить Jitsi. Проверьте интернет и meet.haliwali.ru.");
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(iframePoll);
      try {
        apiRef.current?.dispose();
      } catch {
        /* noop */
      }
      apiRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [open, roomName, display, wireApi, fail]);

  useEffect(() => {
    if (!open || status !== "connecting") return;
    const tid = window.setTimeout(() => {
      fail("Превышено время ожидания подключения.");
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(tid);
  }, [open, status, fail]);

  if (!open) return null;

  void callId;
  void role;
  void peerUserId;

  const peerLabel = (peerDisplayHint ?? "").trim() || "Собеседник";
  const statusLine =
    status === "connected" ? "Разговор"
    : status === "failed" ? "Ошибка подключения"
    : apiLoaded ? "Подключение…"
    : "Загрузка Jitsi…";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Аудиозвонок"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-black">Аудиозвонок</div>
            <div className="truncate text-sm text-black/55">{peerLabel}</div>
            <div className="text-xs text-black/45">{statusLine}</div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
            onClick={hangUp}
          >
            Завершить
          </button>
        </div>

        {error ? (
          <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div ref={containerRef} className="h-[60vh] w-full md:h-[420px]" />
      </div>
    </div>
  );
}
