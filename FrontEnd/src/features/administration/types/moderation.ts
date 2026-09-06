export const UserModerationAction = {
  Warn: "warn",
  Suspend: "suspend",
  Ban: "ban",
} as const;
export type UserModerationAction =
  (typeof UserModerationAction)[keyof typeof UserModerationAction];

export const PostingModerationAction = {
  Approve: "approve",
  Reject: "reject",
} as const;
export type PostingModerationAction =
  (typeof PostingModerationAction)[keyof typeof PostingModerationAction];

export const USER_STATUS_AFTER: Record<UserModerationAction, string> = {
  warn: "warned",
  suspend: "suspended",
  ban: "banned",
};

export const POSTING_STATUS_AFTER: Record<PostingModerationAction, string> = {
  approve: "active",
  reject: "rejected",
};

/** Mensagem sinalizada, na fila de moderação do chat. */
export interface FlaggedMessageReport {
  id: string;
  reason: string;
  reportedBy: { id: string; name: string; role: string } | null;
  createdAt: string;
  resolution: string | null;
}

export interface FlaggedMessage {
  messageId: string;
  threadId: string;
  content: string | null;
  sentAt: string;
  hidden: boolean;
  sender: { id: string; name: string; role: string } | null;
  receiver: { id: string; name: string; role: string } | null;
  /** `auto` quando o filtro do servidor sinalizou sozinho. */
  source: "report" | "auto";
  reports: FlaggedMessageReport[];
}

export type FlaggedDecision = "dismiss" | "hide";
