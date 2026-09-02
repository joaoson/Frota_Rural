// Formas espelhadas do contrato congelado da API (§3.1). Os nomes são
// snake_case de propósito: é exatamente o que o backend devolve, e traduzir
// para camelCase aqui só criaria um ponto a mais para divergir.

export type ChatScope = "rental" | "posting";

export interface ChatUser {
  id: string;
  name: string;
  role: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  receiver_id: string;
  /** null quando `hidden` — a UI mostra o placeholder da moderação. */
  content: string | null;
  sent_at: string;
  read_at: string | null;
  flagged_for_moderation: boolean;
  hidden: boolean;
  client_id: string | null;
}

export interface ChatThread {
  thread_id: string;
  scope: ChatScope;
  scope_id: string;
  scope_label: string;
  peer: ChatUser | null;
  can_write: boolean;
  unread_count: number;
  last_message: ChatMessage | null;
}

export interface ThreadPage {
  count: number;
  limit: number;
  offset: number;
  results: ChatThread[];
}

export interface MessagePage {
  results: ChatMessage[];
  has_more: boolean;
  order: "asc" | "desc";
}

export interface UnreadCounts {
  unread_total: number;
  unread_threads: number;
}

export interface MessageCursor {
  before?: string;
  before_id?: string;
  after?: string;
  after_id?: string;
  limit?: number;
}

export interface AdminMessageReport {
  id: string;
  reason: string;
  reported_by: ChatUser | null;
  created_at: string;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: ChatUser | null;
}

export interface AdminFlaggedMessage {
  message_id: string;
  thread_id: string;
  content: string | null;
  sent_at: string;
  hidden: boolean;
  sender: ChatUser | null;
  receiver: ChatUser | null;
  source: "report" | "auto";
  reports: AdminMessageReport[];
}
