/**
 * Chat message channel abstraction (architecture only).
 *
 * Today all traffic is `internal` (Haliwali web/app). Future bridges (MAX, Telegram, VK)
 * will set provider + external ids on insert; existing rows keep DB default `internal`.
 *
 * Do not store API secrets or tokens in provider_metadata — only bridge-safe ids/flags.
 */

export const CHAT_MESSAGE_PROVIDERS = [
  "internal",
  "max_future",
  "telegram_future",
  "vk_future",
] as const;

export type ChatMessageProvider = (typeof CHAT_MESSAGE_PROVIDERS)[number];

export const DEFAULT_CHAT_MESSAGE_PROVIDER: ChatMessageProvider = "internal";

/** SQL CHECK / migration allowed values (comma-separated for comments). */
export const CHAT_MESSAGE_PROVIDER_SQL_CHECK = CHAT_MESSAGE_PROVIDERS.map((p) => `'${p}'`).join(", ");

export type ChatMessageProviderFields = {
  provider: ChatMessageProvider;
  externalMessageId?: string;
  providerMetadata?: Record<string, unknown>;
};

export type ChatConversationProviderFields = {
  provider: ChatMessageProvider;
  externalChatId?: string;
};

export function normalizeChatMessageProvider(raw: unknown): ChatMessageProvider {
  if (typeof raw === "string" && CHAT_MESSAGE_PROVIDERS.includes(raw as ChatMessageProvider)) {
    return raw as ChatMessageProvider;
  }
  return DEFAULT_CHAT_MESSAGE_PROVIDER;
}

export function normalizeExternalId(raw: unknown, maxLen = 240): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t ? t.slice(0, maxLen) : undefined;
}

export function parseProviderMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

export function providerFieldsFromPgMessage(row: {
  provider?: string | null;
  external_message_id?: string | null;
  provider_metadata?: unknown;
}): ChatMessageProviderFields {
  const provider = normalizeChatMessageProvider(row.provider);
  const externalMessageId = normalizeExternalId(row.external_message_id);
  const providerMetadata = parseProviderMetadata(row.provider_metadata);
  return {
    provider,
    ...(externalMessageId ? { externalMessageId } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

export function providerFieldsFromPgConversation(row: {
  provider?: string | null;
  external_chat_id?: string | null;
}): ChatConversationProviderFields {
  const provider = normalizeChatMessageProvider(row.provider);
  const externalChatId = normalizeExternalId(row.external_chat_id);
  return {
    provider,
    ...(externalChatId ? { externalChatId } : {}),
  };
}

/** True when message originated on site/app (not a mirrored external event). */
export function isInternalChatMessage(provider: ChatMessageProvider | undefined): boolean {
  return !provider || provider === DEFAULT_CHAT_MESSAGE_PROVIDER;
}
