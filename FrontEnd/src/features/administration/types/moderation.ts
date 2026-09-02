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
