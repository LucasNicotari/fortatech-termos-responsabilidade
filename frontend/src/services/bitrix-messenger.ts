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

function openWithEmbeddedSdk(bitrixUserId: string, portalUrl?: string) {
  const bitrix24 = window.BX24;
  if (bitrix24?.im?.openMessenger) {
    bitrix24.init(() => bitrix24.im?.openMessenger?.(bitrixUserId));
    return;
  }

  const normalizedPortal = portalUrl?.replace(/\/$/, '');
  if (normalizedPortal) {
    window.open(
      `${normalizedPortal}/online/?IM_DIALOG=${encodeURIComponent(bitrixUserId)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }
}
