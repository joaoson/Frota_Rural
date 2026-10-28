import type {
  ChatMessage,
  ChatThread,
  ChatUser,
  MarkReadResult,
  MessagePage,
  ThreadPage,
  UnreadCounts,
} from "../types/chat";
import type {
  ChatMessageApi,
  ChatThreadApi,
  ChatUserApi,
  MarkReadApi,
  MessagePageApi,
  ThreadPageApi,
  UnreadCountsApi,
} from "../types/chatSchemas";

export function toChatUser(dto: ChatUserApi): ChatUser {
  return { id: dto.id, name: dto.name, role: dto.role };
}

export function toChatMessage(dto: ChatMessageApi): ChatMessage {
  return {
    id: dto.id,
    threadId: dto.thread_id,
    senderId: dto.sender_id,
    receiverId: dto.receiver_id,
    content: dto.content,
    sentAt: dto.sent_at,
    readAt: dto.read_at ?? null,
    flaggedForModeration: dto.flagged_for_moderation,
    hidden: dto.hidden,
    clientId: dto.client_id ?? null,
  };
}

export function toChatThread(dto: ChatThreadApi): ChatThread {
  return {
    threadId: dto.thread_id,
    scope: dto.scope,
    scopeId: dto.scope_id,
    scopeLabel: dto.scope_label,
    peer: dto.peer ? toChatUser(dto.peer) : null,
    canWrite: dto.can_write,
    unreadCount: dto.unread_count,
    lastMessage: dto.last_message ? toChatMessage(dto.last_message) : null,
  };
}

export function toThreadPage(dto: ThreadPageApi): ThreadPage {
  return {
    count: dto.count,
    limit: dto.limit,
    offset: dto.offset,
    results: dto.results.map(toChatThread),
  };
}

export function toMessagePage(dto: MessagePageApi): MessagePage {
  return {
    results: dto.results.map(toChatMessage),
    hasMore: dto.has_more,
    order: dto.order,
  };
}

export function toUnreadCounts(dto: UnreadCountsApi): UnreadCounts {
  return { unreadTotal: dto.unread_total, unreadThreads: dto.unread_threads };
}

export function toMarkReadResult(dto: MarkReadApi): MarkReadResult {
  return { updated: dto.updated, readAt: dto.read_at, unreadTotal: dto.unread_total };
}
