export type ChatSafetyWarning = {
  kind: "phone" | "link" | "spam" | "messenger";
  message: string;
};

const PHONE_RE = /(?:\+7|8)[\s\-()]*\d[\d\s\-()]{8,12}\d/;
const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+/i;
const MESSENGER_RE = /(?:t\.me\/|telegram\.me\/|wa\.me\/|whatsapp|viber|signal\.me)/i;

export function analyzeChatComposerSafety(text: string): ChatSafetyWarning | null {
  const t = text.trim();
  if (!t) return null;

  if (MESSENGER_RE.test(t)) {
    return {
      kind: "messenger",
      message: "Похоже на ссылку в мессенджер. Будьте осторожны с переводами общения на сторонние сервисы.",
    };
  }

  if (PHONE_RE.test(t)) {
    return {
      kind: "phone",
      message: "В сообщении есть номер телефона. Не переводите оплату на сторонние реквизиты без проверки.",
    };
  }

  if (URL_RE.test(t)) {
    return {
      kind: "link",
      message: "В сообщении есть ссылка. Проверяйте адрес сайта перед переходом.",
    };
  }

  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const [, c] of counts) {
      if (c >= 4) {
        return { kind: "spam", message: "Похоже на повторяющийся текст. Проверьте, не спам ли это." };
      }
    }
  }

  return null;
}
