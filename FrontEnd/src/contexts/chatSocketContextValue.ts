import { createContext } from "react";

import type { ChatSocketHandlers, SocketStatus } from "@/features/chat/hooks/useChatSocket";

export interface ChatSocketValue {
  status: SocketStatus;
  subscribe: (threadId: string) => void;
  unsubscribe: (threadId: string) => void;
  sendMessage: (threadId: string, content: string, clientId: string) => boolean;
  sendRead: (threadId: string, upTo?: string) => boolean;
  sendTyping: (threadId: string, isTyping: boolean) => boolean;
  /** Registra handlers de eventos. Devolve a função de remoção. */
  addListener: (handlers: ChatSocketHandlers) => () => void;
}

export const ChatSocketContext = createContext<ChatSocketValue | undefined>(undefined);
