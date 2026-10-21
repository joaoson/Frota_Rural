import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/useAuth";
import { useChatEvents, useChatSocketContext } from "@/contexts/useChatSocket";

import type { ChatMessage, ChatThread, MessagePage } from "@/features/chat/types/chat";
import type { MessageCursor } from "@/features/chat/types/chatSchemas";
import { useChatActions } from "@/features/chat/hooks/useChat";
import { useChatThreads } from "@/features/chat/hooks/useChatThreads";
import MessageBubble, { type BubbleStatus } from "@/features/chat/components/MessageBubble";
import MessageComposer from "@/features/chat/components/MessageComposer";
import ReportMessageDialog from "@/features/chat/components/ReportMessageDialog";
import ThreadList from "@/features/chat/components/ThreadList";

const SEND_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 50;
const READ_DEBOUNCE_MS = 400;

/** Bolhas otimistas ainda não têm id do servidor e não servem de cursor. */
const isConfirmed = (m: ChatMessage) => !m.id.startsWith("pending-");
const ascending = (page: MessagePage) => (page.order === "asc" ? page.results : [...page.results].reverse());

export default function Mensagens() {
  const chat = useChatActions();
  const { threadId: rawThreadId } = useParams();
  const threadId = rawThreadId ? decodeURIComponent(rawThreadId) : undefined;
  const navigate = useNavigate();
  const { userId } = useAuth();

  const inbox = useChatThreads();
  const { threads, markThreadRead } = inbox;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Record<string, BubbleStatus>>({});
  const [typingPeer, setTypingPeer] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  // Altura da lista antes de inserir mensagens antigas no topo: mantém a leitura no lugar.
  const prependedFrom = useRef<number | null>(null);
  const lastMessageId = useRef<string | undefined>(undefined);
  // Cada conversa aberta ganha uma geração; respostas atrasadas da anterior são descartadas.
  const generation = useRef(0);
  const readTimer = useRef<number | null>(null);

  // Conversa recém-aberta ainda não está no inbox (que só lista threads com
  // mensagem), por isso o fallback buscado direto pelo thread_id.
  const [fetchedThread, setFetchedThread] = useState<ChatThread | null>(null);
  const active = useMemo(
    () =>
      threads.find((t) => t.threadId === threadId) ??
      (fetchedThread?.threadId === threadId ? fetchedThread : null),
    [threads, threadId, fetchedThread],
  );

  /** Insere sem duplicar: a chave é o id; a bolha otimista é substituída
   *  quando chega o eco com o mesmo client_id. */
  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      const byId = prev.findIndex((m) => m.id === incoming.id);
      if (byId >= 0) {
        const next = [...prev];
        next[byId] = incoming;
        return next;
      }
      if (incoming.clientId) {
        const optimistic = prev.findIndex((m) => m.clientId === incoming.clientId);
        if (optimistic >= 0) {
          const next = [...prev];
          next[optimistic] = incoming;
          return next;
        }
      }
      return [...prev, incoming].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    });
    if (incoming.clientId) {
      setPending((p) => {
        const rest = { ...p };
        delete rest[incoming.clientId as string];
        return rest;
      });
    }
  }, []);

  const socket = useChatSocketContext();

  /** Marca como lido o que chegou com a conversa aberta e a aba visível. */
  const markVisibleRead = useCallback((tid: string) => {
    if (document.visibilityState !== "visible") return;
    if (readTimer.current !== null) window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      readTimer.current = null;
      markThreadRead(tid);
      // Pelo socket o servidor também devolve o recibo e o novo contador; o REST é o fallback.
      if (socket.sendRead(tid)) return;
      chat.markRead(tid).then(() => chat.refreshUnread()).catch(() => {});
    }, READ_DEBOUNCE_MS);
  }, [socket, chat, markThreadRead]);

  /** O channel layer não guarda histórico: o que chegou com o socket caído só volta por aqui. */
  const catchUp = useCallback(async (tid: string, current: number) => {
    try {
      const confirmed = [...messagesRef.current].reverse().find(isConfirmed);
      if (!confirmed) {
        // Conversa vazia, ou só com envios pendentes: relê a página recente.
        const page = await chat.listMessages(tid, { limit: PAGE_SIZE });
        if (current !== generation.current) return;
        ascending(page).forEach(upsert);
        setHasOlder(page.hasMore);
      } else {
        let cursor: MessageCursor = { after: confirmed.sentAt, after_id: confirmed.id, limit: 200 };
        for (;;) {
          const page = await chat.listMessages(tid, cursor);
          if (current !== generation.current) return;
          const batch = ascending(page);
          batch.forEach(upsert);
          if (!page.hasMore || batch.length === 0) break;
          const tail = batch[batch.length - 1];
          cursor = { after: tail.sentAt, after_id: tail.id, limit: 200 };
        }
      }
      markVisibleRead(tid);
    } catch {
      /* a próxima reconexão tenta de novo; o que está na tela continua */
    }
  }, [chat, upsert, markVisibleRead]);

  useChatEvents({
    onMessage: (tid, message) => {
      if (tid !== threadId) return;
      upsert(message);
      if (message.senderId !== userId) markVisibleRead(tid);
    },
    // Confirmação do próprio envio, inclusive de um reenvio cujo eco se perdeu.
    onAck: (tid, _clientId, message) => {
      if (tid === threadId) upsert(message);
    },
    onError: (error) => {
      const { clientId } = error;
      if (!clientId || (error.threadId && error.threadId !== threadId)) return;
      setPending((p) => (clientId in p ? { ...p, [clientId]: "failed" } : p));
      toast.error(error.message);
      if (error.code === "forbidden" && threadId) {
        // Locação cancelada ou anúncio pausado com a conversa aberta: relê a permissão.
        void chat.getThread(threadId).then(setFetchedThread).catch(() => {});
        void inbox.refresh();
      }
    },
    onRead: (tid, _readerId, ids) => {
      if (tid !== threadId) return;
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, readAt: m.readAt ?? now } : m)));
    },
    onHidden: (tid, messageId) => {
      if (tid !== threadId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, hidden: true, content: null } : m)),
      );
    },
    onTyping: (tid, _userId, isTyping) => {
      if (tid === threadId) setTypingPeer(isTyping);
    },
    onResync: (ids) => {
      if (!threadId || !ids.includes(threadId)) return;
      void catchUp(threadId, generation.current);
    },
  });

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    const current = ++generation.current;
    setTypingPeer(false);
    setMessages([]);
    setHasOlder(false);
    lastMessageId.current = undefined;
    void (async () => {
      try {
        const [thread, page] = await Promise.all([
          chat.getThread(threadId),
          chat.listMessages(threadId, { limit: PAGE_SIZE }),
        ]);
        if (current !== generation.current) return;
        setFetchedThread(thread);
        setMessages(ascending(page));
        setHasOlder(page.hasMore);
        socket.subscribe(threadId);
        await chat.markRead(threadId);
        markThreadRead(threadId);
        void chat.refreshUnread();
      } catch (error) {
        if (current !== generation.current) return;
        toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
      }
    })();
    return () => {
      socket.unsubscribe(threadId);
      if (readTimer.current !== null) window.clearTimeout(readTimer.current);
      readTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Voltar à aba com mensagens recebidas ainda não lidas marca a leitura.
  useEffect(() => {
    if (!threadId) return;
    const onVisible = () => {
      if (messagesRef.current.some((m) => isConfirmed(m) && m.senderId !== userId && !m.readAt)) {
        markVisibleRead(threadId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [threadId, userId, markVisibleRead]);

  // Desce até o fim só quando chega mensagem nova no fim; ao carregar o
  // histórico antigo, mantém a posição de leitura.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (prependedFrom.current !== null && container) {
      container.scrollTop += container.scrollHeight - prependedFrom.current;
      prependedFrom.current = null;
      return;
    }
    const last = messages[messages.length - 1]?.id;
    if (last !== lastMessageId.current) {
      lastMessageId.current = last;
      bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [messages]);

  const loadOlder = async () => {
    const oldest = messagesRef.current.find(isConfirmed);
    if (!threadId || !oldest || loadingOlder) return;
    const current = generation.current;
    setLoadingOlder(true);
    try {
      const page = await chat.listMessages(threadId, { before: oldest.sentAt, before_id: oldest.id, limit: PAGE_SIZE });
      if (current !== generation.current) return;
      prependedFrom.current = scrollRef.current?.scrollHeight ?? null;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...ascending(page).filter((m) => !known.has(m.id)), ...prev];
      });
      setHasOlder(page.hasMore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const deliver = useCallback(
    (content: string, clientId: string) => {
      if (!threadId) return;
      const sentViaSocket = socket.sendMessage(threadId, content, clientId);
      if (!sentViaSocket) {
        // Mesmo clientId: o servidor é idempotente, então um eco posterior do
        // WS não cria uma segunda linha.
        chat
          .sendMessage(threadId, content, clientId)
          .then(upsert)
          .catch((error: unknown) => {
            setPending((p) => ({ ...p, [clientId]: "failed" }));
            toast.error(error instanceof Error ? error.message : "Falha ao enviar.");
          });
      }
      window.setTimeout(() => {
        setPending((p) => (p[clientId] === "pending" ? { ...p, [clientId]: "failed" } : p));
      }, SEND_TIMEOUT_MS);
    },
    [threadId, socket, upsert, chat],
  );

  const handleSend = (content: string) => {
    if (!threadId || !userId || !active) return;
    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `pending-${clientId}`,
      threadId: threadId,
      senderId: userId,
      receiverId: active.peer?.id ?? "",
      content,
      sentAt: new Date().toISOString(),
      readAt: null,
      flaggedForModeration: false,
      hidden: false,
      clientId: clientId,
    };
    setMessages((prev) => [...prev, optimistic]);
    setPending((p) => ({ ...p, [clientId]: "pending" }));
    deliver(content, clientId);
  };

  const handleRetry = (message: ChatMessage) => {
    if (!message.clientId || !message.content) return;
    setPending((p) => ({ ...p, [message.clientId as string]: "pending" }));
    deliver(message.content, message.clientId);
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="mx-auto flex max-w-6xl gap-4 px-6 pt-32 pb-10">
        <aside
          className={`flex h-[calc(100vh-11rem)] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest md:w-80 ${
            threadId ? "hidden md:block" : "block"
          }`}
        >
          <h1 className="shrink-0 border-b border-outline-variant/30 p-4 font-headline text-lg font-bold text-on-surface">
            Mensagens
          </h1>
          <div className="flex-1 overflow-y-auto">
          <ThreadList
            threads={threads}
            activeId={threadId}
            loading={inbox.loading}
            onSelect={(t) => navigate(`/mensagens/${encodeURIComponent(t.threadId)}`)}
          />
          {inbox.error ? (
            <p className="p-4 text-xs text-error">
              {inbox.error}{" "}
              <button type="button" className="font-bold underline" onClick={() => void inbox.refresh()}>
                Tentar novamente
              </button>
            </p>
          ) : null}
          {inbox.hasMore ? (
            <button
              type="button"
              onClick={() => void inbox.loadMore()}
              disabled={inbox.loadingMore}
              className="w-full p-3 text-sm font-bold text-primary hover:bg-surface-container-high disabled:opacity-60"
            >
              {inbox.loadingMore ? "Carregando..." : "Carregar mais conversas"}
            </button>
          ) : null}
          </div>
        </aside>

        <section
          className={`flex h-[calc(100vh-11rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest ${
            threadId ? "flex" : "hidden md:flex"
          }`}
        >
          {active ? (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-outline-variant/30 p-3">
                <button
                  type="button"
                  className="md:hidden text-on-surface-variant"
                  onClick={() => navigate("/mensagens")}
                  aria-label="Voltar"
                >
                  <MaterialIcon icon="arrow_back" size={20} />
                </button>
                <div className="min-w-0">
                  <p className="truncate font-medium text-on-surface">
                    {active.peer?.name ?? "Usuário"}
                  </p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {active.scopeLabel}
                    {socket.status !== "open" ? " · reconectando..." : ""}
                  </p>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                {hasOlder ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                      className="rounded-full border border-outline-variant/40 px-4 py-1.5 text-xs font-bold text-primary hover:bg-surface-container-high disabled:opacity-60"
                    >
                      {loadingOlder ? "Carregando..." : "Carregar mensagens anteriores"}
                    </button>
                  </div>
                ) : null}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    own={m.senderId === userId}
                    status={m.clientId ? pending[m.clientId] : undefined}
                    onReport={setReporting}
                    onRetry={handleRetry}
                  />
                ))}
                {typingPeer ? (
                  <p className="text-xs italic text-on-surface-variant">digitando...</p>
                ) : null}
                <div ref={bottomRef} />
              </div>

              <MessageComposer
                disabled={!active.canWrite}
                onSend={handleSend}
                onTyping={(t) => threadId && socket.sendTyping(threadId, t)}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-on-surface-variant">
              <MaterialIcon icon="forum" size={40} />
              <p className="text-sm">Escolha uma conversa para começar.</p>
            </div>
          )}
        </section>
      </div>

      <ReportMessageDialog
        key={reporting?.id ?? "none"}
        open={reporting !== null}
        preview={reporting?.content ?? null}
        onOpenChange={(open) => !open && setReporting(null)}
        onConfirm={(reason) => {
          const target = reporting;
          setReporting(null);
          if (!target) return;
          chat
            .reportMessage(target.id, reason)
            .then(() => toast.success("Denúncia registrada."))
            .catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : "Falha ao denunciar."),
            );
        }}
      />
    </div>
  );
}
