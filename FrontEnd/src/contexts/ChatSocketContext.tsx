import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useChatUnread } from "@/contexts/ChatUnreadContext";
import {
  useChatSocket,
  type ChatSocketHandlers,
  type SocketStatus,
} from "@/hooks/useChatSocket";

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

interface ChatSocketValue {
  status: SocketStatus;
  subscribe: (threadId: string) => void;
  unsubscribe: (threadId: string) => void;
  sendMessage: (threadId: string, content: string, clientId: string) => boolean;
  sendRead: (threadId: string, upTo?: string) => boolean;
  sendTyping: (threadId: string, isTyping: boolean) => boolean;
  /** Registra handlers de eventos. Devolve a função de remoção. */
  addListener: (handlers: ChatSocketHandlers) => () => void;
}

const ChatSocketContext = createContext<ChatSocketValue | undefined>(undefined);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const { setUnread, refresh } = useChatUnread();
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
        setUnread(counts);
        each((l) => l.onUnread?.(counts));
      },
      // `unread.updated` emitido com o socket caído não é reenviado — o
      // channel layer não guarda histórico. Toda reconexão relê o contador.
      onResync: (threadIds) => {
        void refresh();
        each((l) => l.onResync?.(threadIds));
      },
    }),
    [each, setUnread, refresh],
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
