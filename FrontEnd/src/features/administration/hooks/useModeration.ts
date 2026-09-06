import { useMutation } from "@tanstack/react-query";

import { moderationStore } from "@/app/container";

import type { PostingModerationAction, UserModerationAction } from "../types/moderation";

export interface ModerateUserInput {
  userId: string;
  action: UserModerationAction;
}

export function useModerateUser() {
  return useMutation<string, Error, ModerateUserInput>({
    mutationFn: ({ userId, action }) => moderationStore.moderateUser(userId, action),
  });
}

export interface ModeratePostingInput {
  postingId: string;
  action: PostingModerationAction;
  reason?: string;
}

export function useModeratePosting() {
  return useMutation<string, Error, ModeratePostingInput>({
    mutationFn: ({ postingId, action, reason }) =>
      moderationStore.moderatePosting(postingId, action, reason),
  });
}
