import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { Review } from "../types/review";
import type { CreateReviewPayload } from "../types/reviewSchemas";
import type { ReviewFilter, ReviewRepository } from "./ReviewRepository";

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  list: (filter: ReviewFilter) => [...reviewKeys.lists(), filter] as const,
};

export class ReviewStore {
  private readonly repository: ReviewRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: ReviewRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(
    filter: ReviewFilter,
  ): UseQueryOptions<Review[], Error, Review[], ReturnType<typeof reviewKeys.list>> {
    return { queryKey: reviewKeys.list(filter), queryFn: () => this.repository.find(filter) };
  }

  create(payload: CreateReviewPayload): Promise<Review> {
    return this.repository.create(payload);
  }

  remove(id: string): Promise<void> {
    return this.repository.remove(id);
  }

  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: reviewKeys.all });
  }
}
