import { useContext, useEffect, useRef } from "react";

import type { ChatSocketHandlers } from "@/features/chat/hooks/useChatSocket";

import { ChatSocketContext } from "./chatSocketContextValue";

export function useChatSocketContext() {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) throw new Error("useChatSocketContext precisa estar dentro de ChatSocketProvider");
  return ctx;
}

/**
 * Escuta os eventos do socket compartilhado.
 *
 * Os handlers passados aqui NÃO precisam ser memoizados: o registro é um proxy
 * estável que lê a versão mais recente de um ref, então trocar de thread não
 * causa registro/desregistro em cascata.
 */
export function useChatEvents(handlers: ChatSocketHandlers) {
  const { addListener } = useChatSocketContext();
  const ref = useRef(handlers);

  // Em efeito, não durante o render: mexer num ref no corpo do componente
  // quebra com renders concorrentes.
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(
    () =>
      addListener({
        onMessage: (...args) => ref.current.onMessage?.(...args),
        onRead: (...args) => ref.current.onRead?.(...args),
        onHidden: (...args) => ref.current.onHidden?.(...args),
        onTyping: (...args) => ref.current.onTyping?.(...args),
        onUnread: (...args) => ref.current.onUnread?.(...args),
        onThreadUpdated: (...args) => ref.current.onThreadUpdated?.(...args),
        onResync: (...args) => ref.current.onResync?.(...args),
      }),
    [addListener],
  );
}
