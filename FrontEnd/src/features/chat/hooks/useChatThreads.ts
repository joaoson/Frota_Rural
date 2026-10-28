import { useCallback, useEffect, useRef, useState } from "react";
import { useChatEvents } from "@/contexts/useChatSocket";
import type { ChatThread } from "../types/chat";
import { useChatActions } from "./useChat";

/** O servidor devolve no máximo 50 conversas por página. */
export const THREAD_PAGE_SIZE = 50;

/**
 * Inbox paginado e vivo, compartilhado por /mensagens e pelo painel dos dashboards.
 *
 * Antes cada tela carregava as primeiras 50 conversas uma vez: o painel do
 * dashboard não mudava enquanto aberto e as conversas além da 50ª sumiam.
 * `thread.updated` chega pelo socket a cada mensagem e é fundido no lugar (a
 * lista é ordenada pela última atividade); uma reconexão relê o que já estava
 * carregado, porque o channel layer não reenvia o que se perdeu.
 */
export function useChatThreads() {
  const chat = useChatActions();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(THREAD_PAGE_SIZE);
  const generation = useRef(0);
  const threadsRef = useRef<ChatThread[]>([]);
  useEffect(() => {
    threadsRef.current = threads;
  });

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const collected: ChatThread[] = [];
      let count = 0;
      while (collected.length < loaded.current) {
        const page = await chat.listThreads({ limit: THREAD_PAGE_SIZE, offset: collected.length });
        count = page.count;
        collected.push(...page.results);
        if (page.results.length < THREAD_PAGE_SIZE) break;
      }
      if (current !== generation.current) return;
      setThreads(collected);
      setTotal(count);
      setError(null);
    } catch (e) {
      if (current === generation.current) {
        setError(e instanceof Error ? e.message : "Não foi possível carregar as conversas.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [chat]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await chat.listThreads({ limit: THREAD_PAGE_SIZE, offset: threads.length });
      setThreads((prev) => {
        const known = new Set(prev.map((t) => t.threadId));
        const next = [...prev, ...page.results.filter((t) => !known.has(t.threadId))];
        loaded.current = Math.max(THREAD_PAGE_SIZE, next.length);
        return next;
      });
      setTotal(page.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar mais conversas.");
    } finally {
      setLoadingMore(false);
    }
  }, [chat, loadingMore, threads.length]);

  /** Zera o contador local de uma conversa que acabou de ser lida. */
  const markThreadRead = useCallback((threadId: string) => {
    setThreads((prev) => prev.map((t) => (t.threadId === threadId ? { ...t, unreadCount: 0 } : t)));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useChatEvents({
    onThreadUpdated: (thread) => {
      if (!threadsRef.current.some((t) => t.threadId === thread.threadId)) setTotal((n) => n + 1);
      setThreads((prev) => [thread, ...prev.filter((t) => t.threadId !== thread.threadId)]);
    },
    onResync: () => void refresh(),
  });

  return {
    threads, loading, error, refresh, markThreadRead,
    hasMore: threads.length < total, loadMore, loadingMore,
  };
}
