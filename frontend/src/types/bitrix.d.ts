interface Bitrix24Sdk {
  init: (callback: () => void) => void;
  fitWindow: (callback?: () => void) => void;
  setTitle?: (title: string) => void;
  im?: {
    openMessenger?: (dialogId: string) => void;
  };
}

interface BitrixMessengerSdk {
  Messenger?: {
    Public?: {
      openChat?: (dialogId: string, messageId?: number) => Promise<unknown> | unknown;
    };
  };
}

interface Window {
  BX24?: Bitrix24Sdk;
  BX?: BitrixMessengerSdk;
}
