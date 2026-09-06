import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/useAuth";
import { useChatEvents, useChatSocketContext } from "@/contexts/useChatSocket";

import type { ChatMessage, ChatThread } from "@/features/chat/types/chat";
import { useChatActions } from "@/features/chat/hooks/useChat";
import MessageBubble, { type BubbleStatus } from "@/features/chat/components/MessageBubble";
import MessageComposer from "@/features/chat/components/MessageComposer";
import ReportMessageDialog from "@/features/chat/components/ReportMessageDialog";
import ThreadList from "@/features/chat/components/ThreadList";

const SEND_TIMEOUT_MS = 10_000;

export default function Mensagens() {
  const chat = useChatActions();
  const { threadId: rawThreadId } = useParams();
  const threadId = rawThreadId ? decodeURIComponent(rawThreadId) : undefined;
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Record<string, BubbleStatus>>({});
  const [typingPeer, setTypingPeer] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

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

  useChatEvents({
    onMessage: (tid, message) => {
      if (tid === threadId) upsert(message);
      void refreshThreads();
    },
    onRead: (tid, readerId, ids) => {
      if (tid !== threadId || readerId === userId) return;
      setMessages((prev) =>
        prev.map((m) =>
          ids.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m,
        ),
      );
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
    onThreadUpdated: () => void refreshThreads(),
    // O channel layer não guarda histórico: o que chegou com o socket caído só
    // volta por aqui.
    onResync: (ids) => {
      if (!threadId || !ids.includes(threadId)) return;
      const last = messagesRef.current[messagesRef.current.length - 1];
      if (!last) return;
      void (async () => {
        let cursor = { after: last.sentAt, after_id: last.id, limit: 200 };
        for (;;) {
          const page = await chat.listMessages(threadId, cursor);
          page.results.forEach(upsert);
          if (!page.hasMore || page.results.length === 0) break;
          const tail = page.results[page.results.length - 1];
          cursor = { after: tail.sentAt, after_id: tail.id, limit: 200 };
        }
      })();
    },
  });

  const refreshThreads = useCallback(async () => {
    try {
      const page = await chat.listThreads({ limit: 50 });
      setThreads(page.results);
    } catch {
      /* inbox stale é melhor do que tela quebrada */
    } finally {
      setLoadingThreads(false);
    }
  }, [chat]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setTypingPeer(false);
    void (async () => {
      try {
        const [thread, page] = await Promise.all([
          chat.getThread(threadId),
          chat.listMessages(threadId, { limit: 50 }),
        ]);
        if (cancelled) return;
        setFetchedThread(thread);
        setMessages([...page.results].reverse()); // vem desc, exibimos asc
        socket.subscribe(threadId);
        const marked = await chat.markRead(threadId);
        chat.setUnread({ unreadTotal: marked.unreadTotal, unreadThreads: 0 });
        void refreshThreads();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
      }
    })();
    return () => {
      cancelled = true;
      socket.unsubscribe(threadId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
            loading={loadingThreads}
            onSelect={(t) => navigate(`/mensagens/${encodeURIComponent(t.threadId)}`)}
          />
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

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
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
