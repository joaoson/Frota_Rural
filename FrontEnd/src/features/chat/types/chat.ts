import type { ChatScope } from "./chatSchemas";

export type { ChatScope };

export interface ChatUser {
  id: string;
  name: string;
  role: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  receiverId: string;
  /** Nulo quando oculto pela moderação. */
  content: string | null;
  sentAt: string;
  readAt: string | null;
  flaggedForModeration: boolean;
  hidden: boolean;
  /** Gerado pelo cliente; o par (remetente, clientId) é idempotente no servidor. */
  clientId: string | null;
}

export interface ChatThread {
  threadId: string;
  scope: ChatScope;
  scopeId: string;
  scopeLabel: string;
  peer: ChatUser | null;
  canWrite: boolean;
  unreadCount: number;
  lastMessage: ChatMessage | null;
}

export interface ThreadPage {
  count: number;
  limit: number;
  offset: number;
  results: ChatThread[];
}

export interface MessagePage {
  results: ChatMessage[];
  hasMore: boolean;
  order: "asc" | "desc";
}

export interface UnreadCounts {
  unreadTotal: number;
  unreadThreads: number;
}

export interface MarkReadResult {
  updated: number;
  readAt: string;
  unreadTotal: number;
}
