import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { User } from "../types/user";
import type { CreateUserPayload } from "./userMapper";
import type { UpdateProfileInput, UserRepository } from "./UserRepository";

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

export class UserStore {
  private readonly repository: UserRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: UserRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(): UseQueryOptions<User[], Error, User[], ReturnType<typeof userKeys.lists>> {
    return { queryKey: userKeys.lists(), queryFn: () => this.repository.list() };
  }

  detailOptions(
    id: string,
  ): UseQueryOptions<User, Error, User, ReturnType<typeof userKeys.detail>> {
    return { queryKey: userKeys.detail(id), queryFn: () => this.repository.findById(id) };
  }

  /** Busca pontual, aproveitando o cache — para quando não há hook envolvido. */
  fetchById(id: string): Promise<User> {
    return this.queryClient.fetchQuery(this.detailOptions(id));
  }

  create(payload: CreateUserPayload): Promise<User> {
    return this.repository.create(payload);
  }

  updateProfile(id: string, input: UpdateProfileInput): Promise<User> {
    return this.repository.updateProfile(id, input);
  }

  changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    return this.repository.changePassword(id, currentPassword, newPassword);
  }

  async invalidateDetail(id: string): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
  }

  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: userKeys.lists() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: userKeys.all });
  }
}
