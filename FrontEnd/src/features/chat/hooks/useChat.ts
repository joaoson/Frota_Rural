import { useMemo } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import { chatStore } from "@/app/container";
import { useAuth } from "@/contexts/useAuth";

import type { ChatMessage, ChatThread, MarkReadResult, UnreadCounts } from "../types/chat";
import type { ChatScope, MessageCursor } from "../types/chatSchemas";

export function useThreads(scope?: ChatScope, enabled = true) {
  return useQuery({ ...chatStore.threadListOptions(scope), enabled });
}

export function useThread(threadId: string | null) {
  return useQuery({ ...chatStore.threadOptions(threadId ?? ""), enabled: Boolean(threadId) });
}

export function useMessages(threadId: string | null) {
  return useQuery({ ...chatStore.messagesOptions(threadId ?? ""), enabled: Boolean(threadId) });
}

/**
 * Contagem de não-lidas: estado de servidor, não estado de contexto.
 *
 * Só consulta com sessão pronta — deslogado o endpoint responde 403, e a
 * chamada seria ruído garantido.
 */
export function useUnreadCount() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({ ...chatStore.unreadOptions(), enabled: isAuthenticated && !isLoading });
}

export function useResolveThread() {
  return useMutation<ChatThread, Error, { scope: ChatScope; scopeId: string; peerId?: string }>({
    mutationFn: ({ scope, scopeId, peerId }) => chatStore.resolveThread(scope, scopeId, peerId),
  });
}

export function useSendMessage() {
  return useMutation<ChatMessage, Error, { threadId: string; content: string; clientId: string }>({
    mutationFn: ({ threadId, content, clientId }) =>
      chatStore.sendMessage(threadId, content, clientId),
    onSuccess: (message) => {
      chatStore.appendMessage(message.threadId, message);
      void chatStore.invalidateThreads();
    },
  });
}

export function useMarkRead() {
  return useMutation<MarkReadResult, Error, { threadId: string; upTo?: string }>({
    mutationFn: ({ threadId, upTo }) => chatStore.markRead(threadId, upTo),
    onSuccess: (result) => {
      chatStore.setUnread({ unreadTotal: result.unreadTotal, unreadThreads: 0 });
      void chatStore.invalidateThreads();
    },
  });
}

export function useReportMessage() {
  return useMutation<void, Error, { messageId: string; reason: string }>({
    mutationFn: ({ messageId, reason }) => chatStore.reportMessage(messageId, reason),
  });
}

export type { UnreadCounts };

/**
 * Operações imperativas do chat, ligadas ao store.
 *
 * A tela de mensagens não é um `useQuery` simples: pagina por cursor, aplica
 * envio otimista e funde eventos do socket. Ela precisa chamar as operações na
 * ordem que o usuário dita — mas continua passando pelo store, nunca pelo
 * repositório.
 */
export function useChatActions() {
  return useMemo(
    () => ({
      listThreads: (params?: { limit?: number; offset?: number; scope?: ChatScope }) =>
        chatStore.listThreads(params),
      listMessages: (threadId: string, cursor?: MessageCursor) =>
        chatStore.listMessages(threadId, cursor),
      getThread: (threadId: string) => chatStore.getThread(threadId),
      markRead: (threadId: string, upTo?: string) => chatStore.markRead(threadId, upTo),
      sendMessage: (threadId: string, content: string, clientId: string) =>
        chatStore.sendMessage(threadId, content, clientId),
      reportMessage: (messageId: string, reason: string) =>
        chatStore.reportMessage(messageId, reason),
      resolveThread: (scope: ChatScope, scopeId: string, peerId?: string) =>
        chatStore.resolveThread(scope, scopeId, peerId),
      setUnread: (counts: UnreadCounts) => chatStore.setUnread(counts),
    }),
    [],
  );
}
