"use client";

export function WebRtcCallModal({
  open,
  callId,
  role,
  peerUserId,
  peerDisplayHint,
  onClose,
}: {
  open: boolean;
  callId: string;
  role: string;
  peerUserId: string;
  peerDisplayHint?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  void callId;
  void role;
  void peerUserId;
  void peerDisplayHint;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-5 shadow-lg">
        <div className="text-base font-semibold text-black">Звонок</div>
        <p className="mt-2 text-sm text-black/60">Аудиозвонок временно недоступен.</p>
        <button
          type="button"
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-xl bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
