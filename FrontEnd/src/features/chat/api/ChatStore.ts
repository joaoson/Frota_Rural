import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type {
  ChatMessage,
  ChatThread,
  MarkReadResult,
  MessagePage,
  ThreadPage,
  UnreadCounts,
} from "../types/chat";
import type { ChatScope, MessageCursor } from "../types/chatSchemas";
import type { ChatRepository } from "./ChatRepository";

export const chatKeys = {
  all: ["chat"] as const,
  threads: () => [...chatKeys.all, "threads"] as const,
  threadList: (scope?: ChatScope) => [...chatKeys.threads(), scope ?? "all"] as const,
  thread: (threadId: string) => [...chatKeys.all, "thread", threadId] as const,
  messages: (threadId: string) => [...chatKeys.all, "messages", threadId] as const,
  unread: () => [...chatKeys.all, "unread"] as const,
};

export class ChatStore {
  private readonly repository: ChatRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: ChatRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  threadListOptions(
    scope?: ChatScope,
  ): UseQueryOptions<ThreadPage, Error, ThreadPage, ReturnType<typeof chatKeys.threadList>> {
    return {
      queryKey: chatKeys.threadList(scope),
      queryFn: () => this.repository.listThreads(scope ? { scope } : {}),
    };
  }

  threadOptions(
    threadId: string,
  ): UseQueryOptions<ChatThread, Error, ChatThread, ReturnType<typeof chatKeys.thread>> {
    return {
      queryKey: chatKeys.thread(threadId),
      queryFn: () => this.repository.findThread(threadId),
    };
  }

  messagesOptions(
    threadId: string,
    cursor?: MessageCursor,
  ): UseQueryOptions<MessagePage, Error, MessagePage, ReturnType<typeof chatKeys.messages>> {
    return {
      queryKey: chatKeys.messages(threadId),
      queryFn: () => this.repository.listMessages(threadId, cursor),
    };
  }

  unreadOptions(): UseQueryOptions<
    UnreadCounts,
    Error,
    UnreadCounts,
    ReturnType<typeof chatKeys.unread>
  > {
    return { queryKey: chatKeys.unread(), queryFn: () => this.repository.getUnread() };
  }

  listThreads(params?: { limit?: number; offset?: number; scope?: ChatScope }): Promise<ThreadPage> {
    return this.repository.listThreads(params);
  }

  listMessages(threadId: string, cursor?: MessageCursor): Promise<MessagePage> {
    return this.repository.listMessages(threadId, cursor);
  }

  getThread(threadId: string): Promise<ChatThread> {
    return this.repository.findThread(threadId);
  }

  resolveThread(scope: ChatScope, scopeId: string, peerId?: string): Promise<ChatThread> {
    return this.repository.resolveThread(scope, scopeId, peerId);
  }

  sendMessage(threadId: string, content: string, clientId: string): Promise<ChatMessage> {
    return this.repository.sendMessage(threadId, content, clientId);
  }

  markRead(threadId: string, upTo?: string): Promise<MarkReadResult> {
    return this.repository.markRead(threadId, upTo);
  }

  reportMessage(messageId: string, reason: string): Promise<void> {
    return this.repository.reportMessage(messageId, reason);
  }

  /** O socket empurra mensagem nova direto no cache, sem ida à rede. */
  appendMessage(threadId: string, message: ChatMessage): void {
    this.queryClient.setQueryData<MessagePage>(chatKeys.messages(threadId), (page) => {
      if (!page) return page;
      if (page.results.some((m) => m.id === message.id)) return page;
      return { ...page, results: [...page.results, message] };
    });
  }

  setUnread(counts: UnreadCounts): void {
    this.queryClient.setQueryData(chatKeys.unread(), counts);
  }

  async invalidateUnread(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
  }

  async invalidateThreads(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: chatKeys.threads() });
  }

  async invalidateMessages(threadId: string): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: chatKeys.all });
  }
}
