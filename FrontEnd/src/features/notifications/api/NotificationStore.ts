import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { NotificationFilter } from "../types/notification";
import type { NotificationRepository } from "./NotificationRepository";

export const notificationKeys = {
  all: ["notifications"] as const,
  user: (userId: string) => ["notifications", userId] as const,
  list: (userId: string, filter: NotificationFilter) => ["notifications", userId, filter] as const,
};

export class NotificationStore {
  private readonly repository: NotificationRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: NotificationRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(userId: string, filter: NotificationFilter = {}) {
    const params = { limit: 20, offset: 0, ...filter };
    return queryOptions({
      queryKey: notificationKeys.list(userId, params),
      queryFn: ({ signal }) => this.repository.list(params, signal),
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
    });
  }

  async setRead(userId: string, id: string, isRead: boolean): Promise<void> {
    await this.repository.setRead(id, isRead);
    await this.invalidate(userId);
  }

  async dismiss(userId: string, id: string): Promise<void> {
    await this.repository.dismiss(id);
    await this.invalidate(userId);
  }

  async readAll(userId: string): Promise<void> {
    await this.repository.readAll();
    await this.invalidate(userId);
  }

  async invalidate(userId: string): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: notificationKeys.user(userId) });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: notificationKeys.all });
  }
}
