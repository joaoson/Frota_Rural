import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { Operator } from "../types/operator";
import type { OperatorPayload } from "./operatorMapper";
import type { OperatorRepository } from "./OperatorRepository";

export const operatorKeys = {
  all: ["operators"] as const,
  list: () => [...operatorKeys.all, "list"] as const,
};

export class OperatorStore {
  private readonly repository: OperatorRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: OperatorRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(): UseQueryOptions<
    Operator[],
    Error,
    Operator[],
    ReturnType<typeof operatorKeys.list>
  > {
    return { queryKey: operatorKeys.list(), queryFn: () => this.repository.list() };
  }

  list(): Promise<Operator[]> {
    return this.repository.list();
  }

  create(payload: OperatorPayload): Promise<Operator> {
    return this.repository.create(payload);
  }

  update(id: string, payload: Partial<OperatorPayload>): Promise<Operator> {
    return this.repository.update(id, payload);
  }

  unlink(id: string): Promise<void> {
    return this.repository.unlink(id);
  }

  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: operatorKeys.list() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: operatorKeys.all });
  }
}
