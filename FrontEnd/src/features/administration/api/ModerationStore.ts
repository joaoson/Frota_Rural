import type { QueryClient } from "@tanstack/react-query";

import { postingKeys } from "@/features/postings/api/PostingStore";
import { userKeys } from "@/features/users/api/UserStore";

import type { PostingModerationAction, UserModerationAction } from "../types/moderation";
import type { ModerationRepository } from "./ModerationRepository";

export class ModerationStore {
  private readonly repository: ModerationRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: ModerationRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  async moderateUser(userId: string, action: UserModerationAction): Promise<string> {
    const message = await this.repository.moderateUser(userId, action);
    await this.queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    return message;
  }

  async moderatePosting(
    postingId: string,
    action: PostingModerationAction,
    reason?: string,
  ): Promise<string> {
    const message =
      action === "approve"
        ? await this.repository.approvePosting(postingId)
        : await this.repository.rejectPosting(postingId, reason ?? "");
    await this.queryClient.invalidateQueries({ queryKey: postingKeys.lists() });
    return message;
  }

  clear(): void {
    // Sem cache próprio — nada a limpar.
  }
}
