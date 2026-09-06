import { useCallback, useMemo, useRef } from "react";
import { chatStore } from "@/app/container";

import { ChatSocketContext, type ChatSocketValue } from "./chatSocketContextValue";
import {
  useChatSocket,
  type ChatSocketHandlers,
} from "@/features/chat/hooks/useChatSocket";

/**
 * Dono do único WebSocket do chat, montado na raiz da aplicação.
 *
 * O socket precisa viver acima das rotas, não dentro de `Mensagens.tsx`: o
 * evento `unread.updated` chega pelo grupo `chat.user.<id>`, ao qual o
 * ChatConsumer inscreve a conexão no `connect`. Com o socket preso a uma tela,
 * o badge da Navbar congelava assim que o usuário saía dela.
 *
 * Telas se plugam via `useChatEvents`, que registra handlers e os remove ao
 * desmontar — o socket em si nunca reconecta por causa disso.
 */


export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef<Set<ChatSocketHandlers>>(new Set());

  const each = useCallback((fn: (handlers: ChatSocketHandlers) => void) => {
    // Cópia antes de iterar: um handler pode se desregistrar durante o próprio
    // despacho (navegação disparada por uma mensagem, por exemplo).
    Array.from(listeners.current).forEach(fn);
  }, []);

  // Handlers estáveis: o hook guarda esta identidade num ref e só o fan-out
  // muda por baixo.
  const dispatcher = useMemo<ChatSocketHandlers>(
    () => ({
      onMessage: (tid, message) => each((l) => l.onMessage?.(tid, message)),
      onRead: (tid, readerId, ids, upTo) => each((l) => l.onRead?.(tid, readerId, ids, upTo)),
      onHidden: (tid, messageId) => each((l) => l.onHidden?.(tid, messageId)),
      onTyping: (tid, userId, isTyping) => each((l) => l.onTyping?.(tid, userId, isTyping)),
      onThreadUpdated: (thread) => each((l) => l.onThreadUpdated?.(thread)),
      // O badge é responsabilidade do provider, não da tela: é isto que o faz
      // atualizar em qualquer rota.
      onUnread: (counts) => {
        chatStore.setUnread(counts);
        each((l) => l.onUnread?.(counts));
      },
      // `unread.updated` emitido com o socket caído não é reenviado — o
      // channel layer não guarda histórico. Toda reconexão relê o contador.
      onResync: (threadIds) => {
        void chatStore.invalidateUnread();
        each((l) => l.onResync?.(threadIds));
      },
    }),
    [each],
  );

  const socket = useChatSocket(dispatcher);

  const addListener = useCallback((handlers: ChatSocketHandlers) => {
    listeners.current.add(handlers);
    return () => {
      listeners.current.delete(handlers);
    };
  }, []);

  const value = useMemo<ChatSocketValue>(
    () => ({ ...socket, addListener }),
    [socket, addListener],
  );

  return <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>;
}
