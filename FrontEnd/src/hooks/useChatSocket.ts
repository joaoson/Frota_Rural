import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AxiosInstance, setAccessToken } from "@/services/AxiosInstance";
import type { ChatMessage, ChatThread, UnreadCounts } from "@/services/ChatService/models/ChatModels";

export type SocketStatus = "connecting" | "open" | "closed";

export interface ChatSocketHandlers {
  onMessage?: (threadId: string, message: ChatMessage) => void;
  onRead?: (threadId: string, readerId: string, messageIds: string[], upTo: string) => void;
  onHidden?: (threadId: string, messageId: string) => void;
  onTyping?: (threadId: string, userId: string, isTyping: boolean) => void;
  onUnread?: (counts: UnreadCounts) => void;
  onThreadUpdated?: (thread: ChatThread) => void;
  /** Chamado após reconectar, para o consumidor buscar o que perdeu via REST. */
  onResync?: (threadIds: string[]) => void;
}

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS = 25_000;
const SILENCE_TIMEOUT_MS = 60_000;
const STABLE_MS = 5_000;

function wsUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (explicit) return `${explicit.replace(/\/$/, "")}/ws/chat`;
  const api = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000/api/";
  const base = api.replace(/\/?api\/?$/, "").replace(/^http/, "ws");
  return `${base}/ws/chat`;
}

/**
 * Uma conexão multiplexada para todo o chat.
 *
 * O ponto não óbvio: o channel layer não guarda histórico, então nada que
 * chegue enquanto o socket está caído é reenviado. A garantia de não perder
 * mensagem é o resync via REST (`onResync`) disparado a cada reconexão — não
 * o WebSocket.
 */
export function useChatSocket(handlers: ChatSocketHandlers) {
  const { tokens, isAuthenticated, isLoading, logout } = useAuth();
  const [status, setStatus] = useState<SocketStatus>("closed");

  const socketRef = useRef<WebSocket | null>(null);
  const desiredThreads = useRef<Set<string>>(new Set());
  const attemptRef = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const openedAt = useRef(0);
  const refreshedOnce = useRef(false);
  const manualClose = useRef(false);
  // StrictMode monta o efeito duas vezes em dev; sem esta guarda abriríamos
  // dois sockets e tudo chegaria duplicado.
  const connecting = useRef(false);
  const handlersRef = useRef(handlers);

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      window.clearInterval(ref.current);
      ref.current = null;
    }
  };

  const send = useCallback((payload: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearTimer(silenceTimer);
    silenceTimer.current = window.setTimeout(() => {
      socketRef.current?.close();
    }, SILENCE_TIMEOUT_MS);
  }, []);

  // `connect` se referencia a si mesmo no onclose (reconexão). Guardar a
  // versão mais recente num ref evita capturar um closure velho — sem isto o
  // reconnect continuaria usando o token da primeira montagem.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (connecting.current || socketRef.current) return;
    const token = tokens?.access;
    if (!token) return;

    connecting.current = true;
    setStatus("connecting");
    // Token no subprotocolo: nunca aparece em query string nem em log de acesso.
    const socket = new WebSocket(wsUrl(), ["bearer", token]);
    socketRef.current = socket;

    socket.onopen = () => {
      connecting.current = false;
      openedAt.current = Date.now();
      refreshedOnce.current = false;
      setStatus("open");
      const threads = Array.from(desiredThreads.current);
      threads.forEach((thread_id) => send({ type: "thread.subscribe", thread_id }));
      handlersRef.current.onResync?.(threads);
      clearTimer(heartbeatTimer);
      heartbeatTimer.current = window.setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      armSilenceTimer();
    };

    socket.onmessage = (event) => {
      armSilenceTimer();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }
      const h = handlersRef.current;
      switch (data.type) {
        case "message.new":
          h.onMessage?.(data.thread_id as string, data.message as ChatMessage);
          break;
        case "message.read":
          h.onRead?.(
            data.thread_id as string,
            data.reader_id as string,
            (data.message_ids as string[]) ?? [],
            data.up_to as string,
          );
          break;
        case "message.hidden":
          h.onHidden?.(data.thread_id as string, data.message_id as string);
          break;
        case "typing":
          h.onTyping?.(data.thread_id as string, data.user_id as string, Boolean(data.is_typing));
          break;
        case "unread.updated":
          h.onUnread?.({
            unread_total: data.unread_total as number,
            unread_threads: data.unread_threads as number,
          });
          break;
        case "thread.updated":
          h.onThreadUpdated?.(data.thread as ChatThread);
          break;
        default:
          break;
      }
    };

    socket.onclose = (event) => {
      connecting.current = false;
      socketRef.current = null;
      clearTimer(heartbeatTimer);
      clearTimer(silenceTimer);
      setStatus("closed");
      if (manualClose.current || event.code === 1000 || event.code === 4403) return;

      if (event.code === 4401 && !refreshedOnce.current) {
        // Token expirou durante a sessão: renova uma vez e tenta de novo na hora.
        refreshedOnce.current = true;
        AxiosInstance.post<{ access: string }>("login/refresh")
          .then(({ data }) => {
            setAccessToken(data.access);
            connectRef.current();
          })
          .catch(() => logout());
        return;
      }
      if (event.code === 4401) {
        logout();
        return;
      }

      if (Date.now() - openedAt.current > STABLE_MS) attemptRef.current = 0;
      const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attemptRef.current);
      const jitter = base * (0.8 + Math.random() * 0.4);
      attemptRef.current += 1;
      const delay = event.code === 4429 ? 30_000 : jitter;
      reconnectTimer.current = window.setTimeout(() => connectRef.current(), delay);
    };
  }, [tokens?.access, logout, send, armSilenceTimer]);

  // Refs sincronizados em efeito, não durante o render: atualizar um ref no
  // corpo do componente quebra com renders concorrentes.
  useEffect(() => {
    handlersRef.current = handlers;
    connectRef.current = connect;
  });

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    manualClose.current = false;
    // Fora do commit do efeito: connect() chama setStatus, e disparar isso
    // sincronamente no efeito provoca render em cascata.
    const kickoff = window.setTimeout(() => connectRef.current(), 0);
    return () => {
      window.clearTimeout(kickoff);
      manualClose.current = true;
      clearTimer(reconnectTimer);
      clearTimer(heartbeatTimer);
      clearTimer(silenceTimer);
      socketRef.current?.close(1000);
      socketRef.current = null;
      connecting.current = false;
    };
  }, [isLoading, isAuthenticated, connect]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      attemptRef.current = 0;
      clearTimer(reconnectTimer);
      connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [connect]);

  const subscribe = useCallback(
    (threadId: string) => {
      desiredThreads.current.add(threadId);
      send({ type: "thread.subscribe", thread_id: threadId });
    },
    [send],
  );

  const unsubscribe = useCallback(
    (threadId: string) => {
      desiredThreads.current.delete(threadId);
      send({ type: "thread.unsubscribe", thread_id: threadId });
    },
    [send],
  );

  /** false = socket fechado; o chamador deve cair no POST REST. */
  const sendMessage = useCallback(
    (threadId: string, content: string, clientId: string) =>
      send({ type: "message.send", thread_id: threadId, content, client_id: clientId }),
    [send],
  );

  const sendRead = useCallback(
    (threadId: string, upTo?: string) =>
      send({ type: "message.read", thread_id: threadId, ...(upTo ? { up_to: upTo } : {}) }),
    [send],
  );

  const sendTyping = useCallback(
    (threadId: string, isTyping: boolean) =>
      send({ type: "typing", thread_id: threadId, is_typing: isTyping }),
    [send],
  );

  // Memoizado porque este objeto é servido como valor do ChatSocketContext:
  // uma identidade nova a cada render re-renderizaria toda a árvore.
  return useMemo(
    () => ({ status, subscribe, unsubscribe, sendMessage, sendRead, sendTyping }),
    [status, subscribe, unsubscribe, sendMessage, sendRead, sendTyping],
  );
}
