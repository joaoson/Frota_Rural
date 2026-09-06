import type { HttpClient } from "@/shared/http/HttpClient";

import type {
  ChatMessage,
  ChatThread,
  MarkReadResult,
  MessagePage,
  ThreadPage,
  UnreadCounts,
} from "../types/chat";
import {
  chatMessageApiSchema,
  chatThreadApiSchema,
  markReadApiSchema,
  messagePageApiSchema,
  threadPageApiSchema,
  unreadCountsApiSchema,
  type ChatScope,
  type MessageCursor,
} from "../types/chatSchemas";
import {
  toChatMessage,
  toChatThread,
  toMarkReadResult,
  toMessagePage,
  toThreadPage,
  toUnreadCounts,
} from "./chatMapper";

/**
 * O `thread_id` é opaco: nunca é construído nem interpretado aqui, só recebido
 * do servidor e devolvido a ele. É o que permite trocar a chave composta por um
 * UUID no dia em que existir uma tabela `conversations`, sem tocar no front.
 * O encode acontece aqui, nunca no chamador.
 */
const seg = (threadId: string) => encodeURIComponent(threadId);

// `chat/threads/` e `chat/messages/…/report` levam barra; o resto não.
const THREADS = "chat/threads/";
const RESOLVE = "chat/threads/resolve";
const UNREAD = "chat/unread";

export interface ChatRepository {
  resolveThread(scope: ChatScope, scopeId: string, peerId?: string): Promise<ChatThread>;
  findThread(threadId: string): Promise<ChatThread>;
  listThreads(params?: { limit?: number; offset?: number; scope?: ChatScope }): Promise<ThreadPage>;
  listMessages(threadId: string, cursor?: MessageCursor): Promise<MessagePage>;
  sendMessage(threadId: string, content: string, clientId: string): Promise<ChatMessage>;
  markRead(threadId: string, upTo?: string): Promise<MarkReadResult>;
  getUnread(): Promise<UnreadCounts>;
  reportMessage(messageId: string, reason: string): Promise<void>;
}

export class HttpChatRepository implements ChatRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async resolveThread(scope: ChatScope, scopeId: string, peerId?: string): Promise<ChatThread> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: RESOLVE,
      body: { scope, scope_id: scopeId, ...(peerId ? { peer_id: peerId } : {}) },
    });
    return toChatThread(chatThreadApiSchema.parse(response.data));
  }

  /** Uma conversa sem mensagens não aparece no inbox, que é derivado das
   *  mensagens — abrir por link direto exige este GET. */
  async findThread(threadId: string): Promise<ChatThread> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: `${THREADS}${seg(threadId)}`,
    });
    return toChatThread(chatThreadApiSchema.parse(response.data));
  }

  async listThreads(
    params: { limit?: number; offset?: number; scope?: ChatScope } = {},
  ): Promise<ThreadPage> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: THREADS,
      query: params,
    });
    return toThreadPage(threadPageApiSchema.parse(response.data));
  }

  async listMessages(threadId: string, cursor: MessageCursor = {}): Promise<MessagePage> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: `${THREADS}${seg(threadId)}/messages`,
      query: { ...cursor },
    });
    return toMessagePage(messagePageApiSchema.parse(response.data));
  }

  /** `clientId` é reutilizado no reenvio: o servidor trata (remetente,
   *  clientId) como idempotente, então retry nunca duplica. */
  async sendMessage(threadId: string, content: string, clientId: string): Promise<ChatMessage> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `${THREADS}${seg(threadId)}/messages`,
      body: { content, client_id: clientId },
    });
    return toChatMessage(chatMessageApiSchema.parse(response.data));
  }

  async markRead(threadId: string, upTo?: string): Promise<MarkReadResult> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `${THREADS}${seg(threadId)}/read`,
      body: upTo ? { up_to: upTo } : {},
    });
    return toMarkReadResult(markReadApiSchema.parse(response.data));
  }

  /** O badge nunca deve derrubar a tela: falha vira zero. */
  async getUnread(): Promise<UnreadCounts> {
    try {
      const response = await this.http.send<unknown>({ method: "GET", path: UNREAD });
      return toUnreadCounts(unreadCountsApiSchema.parse(response.data));
    } catch {
      return { unreadTotal: 0, unreadThreads: 0 };
    }
  }

  async reportMessage(messageId: string, reason: string): Promise<void> {
    await this.http.send<unknown>({
      method: "POST",
      path: `chat/messages/${messageId}/report`,
      body: { reason },
    });
  }
}
