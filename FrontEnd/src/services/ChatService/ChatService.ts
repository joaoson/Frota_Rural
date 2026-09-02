import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";
import { ChatError, ChatServiceError } from "./errors/ChatError";
import type {
  AdminFlaggedMessage,
  ChatMessage,
  ChatScope,
  ChatThread,
  MessageCursor,
  MessagePage,
  ThreadPage,
  UnreadCounts,
} from "./models/ChatModels";

/**
 * O `thread_id` é opaco para o cliente: nunca é construído nem interpretado
 * aqui, só recebido de `resolveThread`/`listThreads` e devolvido ao servidor.
 * É isso que permite ao backend trocar a chave composta por um UUID no dia em
 * que existir uma tabela `conversations`, sem tocar no frontend.
 *
 * O encode acontece dentro do serviço, nunca no chamador.
 */
function seg(threadId: string) {
  return encodeURIComponent(threadId);
}

function translate(error: unknown): never {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    // A API usa {"error": ...} nas regras de negócio e {"detail": ...} nas
    // negativas de permissão do DRF. Ler só a primeira fazia toda negativa de
    // permissão cair no fallback genérico e mentir sobre o motivo.
    const body = error.response?.data as { error?: string; detail?: string } | undefined;
    const detail = body?.error ?? body?.detail;
    if (detail) throw new ChatServiceError(detail);
    if (status === 403) throw new ChatServiceError(ChatError.Forbidden);
    if (status === 404) throw new ChatServiceError(ChatError.NotFound);
    if (status === 409) throw new ChatServiceError(ChatError.AlreadyReported);
    if (status === 429) throw new ChatServiceError(ChatError.RateLimited);
  }
  throw new ChatServiceError(ChatError.ServerError);
}

class ChatService {
  async resolveThread(
    scope: ChatScope,
    scopeId: string,
    peerId?: string,
  ): Promise<ChatThread> {
    try {
      const { data } = await AxiosInstance.post<ChatThread>("chat/threads/resolve", {
        scope,
        scope_id: scopeId,
        ...(peerId ? { peer_id: peerId } : {}),
      });
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  /** Uma conversa sem mensagens não existe no inbox (que é derivado da tabela
   *  de mensagens), então abrir por link direto precisa deste GET. */
  async getThread(threadId: string): Promise<ChatThread> {
    try {
      const { data } = await AxiosInstance.get<ChatThread>(`chat/threads/${seg(threadId)}`);
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async listThreads(params: { limit?: number; offset?: number; scope?: ChatScope } = {}) {
    try {
      const { data } = await AxiosInstance.get<ThreadPage>("chat/threads/", { params });
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async listMessages(threadId: string, cursor: MessageCursor = {}) {
    try {
      const { data } = await AxiosInstance.get<MessagePage>(
        `chat/threads/${seg(threadId)}/messages`,
        { params: cursor },
      );
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  /** `clientId` é gerado pelo chamador e reutilizado no reenvio: o servidor
   *  trata (sender, client_id) como idempotente, então retry nunca duplica. */
  async sendMessage(threadId: string, content: string, clientId: string) {
    try {
      const { data } = await AxiosInstance.post<ChatMessage>(
        `chat/threads/${seg(threadId)}/messages`,
        { content, client_id: clientId },
      );
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async markRead(threadId: string, upTo?: string) {
    try {
      const { data } = await AxiosInstance.post<{
        updated: number;
        read_at: string;
        unread_total: number;
      }>(`chat/threads/${seg(threadId)}/read`, upTo ? { up_to: upTo } : {});
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async getUnread(): Promise<UnreadCounts> {
    try {
      const { data } = await AxiosInstance.get<UnreadCounts>("chat/unread");
      return data;
    } catch {
      // O badge nunca deve derrubar a tela.
      return { unread_total: 0, unread_threads: 0 };
    }
  }

  async reportMessage(messageId: string, reason: string) {
    try {
      const { data } = await AxiosInstance.post<{ message: string }>(
        `chat/messages/${messageId}/report`,
        { reason },
      );
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async listFlagged(params: { status?: string; source?: string; limit?: number; offset?: number } = {}) {
    try {
      const { data } = await AxiosInstance.get<{
        count: number;
        limit: number;
        offset: number;
        results: AdminFlaggedMessage[];
      }>("admin/chat/messages/", { params });
      return data;
    } catch (error) {
      return translate(error);
    }
  }

  async resolveFlagged(messageId: string, decision: "dismiss" | "hide", note?: string) {
    try {
      const { data } = await AxiosInstance.put<{ message: string }>(
        `admin/chat/messages/${messageId}/resolve`,
        { decision, ...(note ? { note } : {}) },
      );
      return data;
    } catch (error) {
      return translate(error);
    }
  }
}

export const chatService = new ChatService();
