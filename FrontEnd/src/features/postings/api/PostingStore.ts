import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { PostingDetail, PostingListItem } from "../types/posting";
import type { PostingWritePayload } from "../types/postingSchemas";
import type { PostingFilter, PostingRepository } from "./PostingRepository";

export const postingKeys = {
  all: ["postings"] as const,
  lists: () => [...postingKeys.all, "list"] as const,
  list: (filter: PostingFilter) => [...postingKeys.lists(), filter] as const,
  detail: (id: string) => [...postingKeys.all, "detail", id] as const,
};

export class PostingStore {
  private readonly repository: PostingRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: PostingRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(
    filter: PostingFilter = {},
  ): UseQueryOptions<
    PostingListItem[],
    Error,
    PostingListItem[],
    ReturnType<typeof postingKeys.list>
  > {
    return { queryKey: postingKeys.list(filter), queryFn: () => this.repository.list(filter) };
  }

  detailOptions(
    id: string,
  ): UseQueryOptions<PostingDetail, Error, PostingDetail, ReturnType<typeof postingKeys.detail>> {
    return { queryKey: postingKeys.detail(id), queryFn: () => this.repository.findById(id) };
  }

  create(payload: PostingWritePayload): Promise<string> {
    return this.repository.create(payload);
  }

  update(id: string, payload: PostingWritePayload): Promise<void> {
    return this.repository.update(id, payload);
  }

  remove(id: string): Promise<void> {
    return this.repository.remove(id);
  }

  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: postingKeys.lists() });
  }

  async invalidateDetail(id: string): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: postingKeys.detail(id) });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: postingKeys.all });
  }
}
