/** Heuristics for optional “инструменты для работы с клиентами” suggestion (UI only). */

export const CLIENT_TOOLS_MIN_ACTIVE_CHATS = 10;
export const CLIENT_TOOLS_MIN_SERVICE_LISTINGS = 3;

export type ClientToolsEligibilityInput = {
  activeChatCount: number;
  serviceListingCount: number;
  hasCompanyChat: boolean;
};

export function isEligibleForClientToolsSuggestion(input: ClientToolsEligibilityInput): boolean {
  if (input.activeChatCount >= CLIENT_TOOLS_MIN_ACTIVE_CHATS) return true;
  if (input.serviceListingCount >= CLIENT_TOOLS_MIN_SERVICE_LISTINGS) return true;
  if (input.hasCompanyChat) return true;
  return false;
}
