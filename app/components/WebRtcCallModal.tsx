"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { jitsiRoomNameForChatId } from "../lib/jitsiRoomName";

type JitsiMeetExternalApi = {
  dispose: () => void;
  executeCommand: (name: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (payload?: unknown) => void) => void;
  on?: (event: string, handler: (payload?: unknown) => void) => void;
};

const JitsiMeeting = dynamic(
  () => import("@jitsi/react-sdk").then((mod) => mod.JitsiMeeting),
  { ssr: false },
);

const JITSI_DOMAIN = "meet.jit.si";
const CONNECT_TIMEOUT_MS = 45_000;

/** Client defaults: no prejoin, no lobby UI, audio-only, anonymous-friendly. */
const JITSI_CONFIG: Record<string, unknown> = {
  prejoinPageEnabled: false,
  prejoinConfig: { enabled: false },
  startAudioOnly: true,
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
  lobby: {
    autoKnock: false,
    enableChat: false,
  },
  securityUi: {
    hideLobbyButton: true,
    disableLobbyPassword: true,
  },
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

function devLog(step: string, data?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
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
  const apiRef = useRef<JitsiMeetExternalApi | null>(null);
  const joinedRef = useRef(false);
  const listenersWiredRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [error, setError] = useState<string | null>(null);

  const roomName = jitsiRoomNameForChatId(chatId, callId);
  const display = (displayName ?? "").trim() || "Участник";

  const fail = useCallback((message: string) => {
    setStatus("failed");
    setError(message);
    devLog("failed", message);
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
    listenersWiredRef.current = false;
    joinedRef.current = false;
    window.setTimeout(() => onClose(), 300);
  }, [onClose]);

  const wireApi = useCallback(
    (api: JitsiMeetExternalApi) => {
      if (listenersWiredRef.current) return;
      listenersWiredRef.current = true;

      const on = (event: string, handler: (payload?: unknown) => void) => {
        if (typeof api.on === "function") api.on(event, handler);
        else api.addListener(event, handler);
      };

      on("videoConferenceJoined", () => {
        joinedRef.current = true;
        setError(null);
        setStatus("connected");
        disableLobbyOnApi(api);
        devLog("videoConferenceJoined");
      });
      on("participantRoleChanged", (payload) => {
        const roleName =
          payload && typeof payload === "object" && "role" in payload
            ? String((payload as { role?: string }).role ?? "")
            : "";
        if (roleName === "moderator") {
          disableLobbyOnApi(api);
          devLog("participantRoleChanged", { role: roleName });
        }
      });
      on("micError", (payload) => {
        const msg =
          payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: string }).message ?? "")
            : "";
        fail(msg ? `Микрофон: ${msg}` : "Нет доступа к микрофону в Jitsi.");
      });
      on("errorOccurred", (payload) => {
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
      listenersWiredRef.current = false;
      joinedRef.current = false;
      setStatus("connecting");
      setError(null);
      return;
    }

    setStatus("connecting");
    setError(null);
    devLog("open", { domain: JITSI_DOMAIN, roomName });
  }, [open, roomName]);

  useEffect(() => {
    if (!open || status !== "connecting") return;
    const tid = window.setTimeout(() => {
      fail("Превышено время ожидания подключения.");
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(tid);
  }, [open, status, fail]);

  useEffect(() => {
    return () => {
      try {
        apiRef.current?.dispose();
      } catch {
        /* noop */
      }
      apiRef.current = null;
    };
  }, []);

  if (!open) return null;

  void role;
  void peerUserId;

  const peerLabel = (peerDisplayHint ?? "").trim() || "Собеседник";
  const statusLine =
    status === "connected" ? "Разговор" : status === "failed" ? "Ошибка подключения" : "Подключение…";

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

        <div className="h-[60vh] w-full md:h-[420px]">
          <JitsiMeeting
            domain={JITSI_DOMAIN}
            roomName={roomName}
            lang="ru"
            userInfo={{ displayName: display, email: "" }}
            configOverwrite={JITSI_CONFIG}
            interfaceConfigOverwrite={JITSI_INTERFACE}
            onApiReady={(externalApi) => {
              const api = externalApi as JitsiMeetExternalApi;
              apiRef.current = api;
              devLog("api_ready");
              wireApi(api);
              disableLobbyOnApi(api);
            }}
            onReadyToClose={() => {
              if (joinedRef.current) hangUp();
              else fail("Сессия Jitsi завершена до подключения.");
            }}
            getIFrameRef={(parentNode) => {
              parentNode.style.width = "100%";
              parentNode.style.height = "100%";
              const iframe = parentNode.querySelector("iframe");
              if (iframe instanceof HTMLIFrameElement) {
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.setAttribute("allow", "microphone; camera; display-capture; autoplay");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
