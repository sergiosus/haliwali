import { publicChatMessageSenderLabel } from "./serverChatParticipantLabel";
import { getCompanyConversation } from "./serverCompanyChatsStore";
import { getListingConversation } from "./serverListingChatsStore";
import { getListingById } from "./serverListingsStore";
import type { ChatSummarySourceMessage } from "./serverChatAiSummary";

export type ChatAiListingContext = {
  title: string;
  city?: string;
  category?: string;
  price?: number;
};

export type ChatAiConversationBundle = {
  messages: ChatSummarySourceMessage[];
  listingContext?: ChatAiListingContext;
  companyTitle?: string;
  listingOwnerId?: string;
  buyerId?: string;
  companyOwnerId?: string;
  companyCustomerId?: string;
};

function toSummaryMessages(
  rows: Array<{
    createdAt: number;
    senderId: string;
    senderName?: string;
    type?: "text" | "file";
    text?: string;
    fileName?: string;
  }>,
): ChatSummarySourceMessage[] {
  return rows.map((m) => ({
    createdAt: m.createdAt,
    senderLabel: publicChatMessageSenderLabel(m.senderId, m.senderName),
    type: m.type ?? "text",
    text: m.text,
    fileName: m.fileName,
  }));
}

export async function loadChatAiConversation(chatId: string): Promise<ChatAiConversationBundle | null> {
  if (chatId.startsWith("company:")) {
    const conv = await getCompanyConversation(chatId);
    if (!conv) return null;
    return {
      messages: toSummaryMessages(conv.messages),
      companyTitle: conv.companyTitle.trim() || undefined,
      companyOwnerId: conv.ownerUserId.trim() || undefined,
      companyCustomerId: conv.customerId.trim() || undefined,
    };
  }

  const conv = await getListingConversation(chatId);
  if (!conv) return null;

  const bundle: ChatAiConversationBundle = {
    messages: toSummaryMessages(conv.messages),
    listingOwnerId: conv.listingOwnerId.trim() || undefined,
    buyerId: conv.buyerId.trim() || undefined,
    listingContext: {
      title: conv.listingTitle.trim() || "Объявление",
    },
  };

  const listingId = conv.listingId.trim();
  if (listingId) {
    try {
      const listing = await getListingById(listingId);
      if (listing) {
        const baseTitle = bundle.listingContext?.title ?? "Объявление";
        const price =
          listing.type === "product_sell" || listing.type === "product_buy"
            ? typeof listing.price === "number" && Number.isFinite(listing.price)
              ? listing.price
              : undefined
            : undefined;
        bundle.listingContext = {
          title: (listing.title ?? baseTitle).trim() || "Объявление",
          city: listing.city?.trim() || undefined,
          category: listing.categoryName?.trim() || undefined,
          price,
        };
      }
    } catch {
      // listing lookup is optional enrichment only
    }
  }

  return bundle;
}
