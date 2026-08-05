export function openBitrixConversation(
  bitrixUserId: string,
  chatMessageId?: string,
  portalUrl?: string
) {
  const messageId = chatMessageId ? Number(chatMessageId) : undefined;
  const publicMessenger = window.BX?.Messenger?.Public;

  if (publicMessenger?.openChat) {
    try {
      const result = publicMessenger.openChat(
        bitrixUserId,
        Number.isSafeInteger(messageId) ? messageId : undefined
      );
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => openWithEmbeddedSdk(bitrixUserId, portalUrl));
      }
      return;
    } catch {
      // Usa o SDK de aplicativos incorporados abaixo.
    }
  }

  openWithEmbeddedSdk(bitrixUserId, portalUrl);
}

export function buildBitrixConversationUrl(bitrixUserId: string, portalUrl?: string) {
  if (!portalUrl || !bitrixUserId) return undefined;

  try {
    const url = new URL('/online/', portalUrl);
    if (url.protocol !== 'https:') return undefined;
    url.searchParams.set('IM_DIALOG', bitrixUserId);
    return url.toString();
  } catch {
    return undefined;
  }
}

function openWithEmbeddedSdk(bitrixUserId: string, portalUrl?: string) {
  const bitrix24 = window.BX24;
  if (bitrix24?.im?.openMessenger) {
    bitrix24.init(() => bitrix24.im?.openMessenger?.(bitrixUserId));
    return;
  }

  const conversationUrl = buildBitrixConversationUrl(bitrixUserId, portalUrl);
  if (conversationUrl) {
    window.open(conversationUrl, '_blank', 'noopener,noreferrer');
  }
}
