import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { Machine } from "../types/machine";
import type { CreateMachinePayload } from "../types/machineSchemas";
import type { MachineFilter, MachineRepository } from "./MachineRepository";

export const machineKeys = {
  all: ["machines"] as const,
  lists: () => [...machineKeys.all, "list"] as const,
  list: (filter: MachineFilter) => [...machineKeys.lists(), filter] as const,
};

export class MachineStore {
  private readonly repository: MachineRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: MachineRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  listOptions(
    filter: MachineFilter = {},
  ): UseQueryOptions<Machine[], Error, Machine[], ReturnType<typeof machineKeys.list>> {
    return {
      queryKey: machineKeys.list(filter),
      queryFn: () => this.repository.list(filter),
    };
  }

  create(payload: CreateMachinePayload): Promise<Machine> {
    return this.repository.create(payload);
  }

  update(id: string, payload: Partial<CreateMachinePayload>): Promise<Machine> {
    return this.repository.update(id, payload);
  }

  remove(id: string): Promise<void> {
    return this.repository.remove(id);
  }

  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: machineKeys.lists() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: machineKeys.all });
  }
}
