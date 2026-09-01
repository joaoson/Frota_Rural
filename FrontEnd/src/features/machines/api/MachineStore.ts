import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { Machine } from "../types/machine";
import type { CreateMachinePayload } from "../types/machineSchemas";
import type { MachineFilter, MachineRepository } from "./MachineRepository";

/**
 * Fábrica de chaves de cache. Centralizar aqui evita chaves divergentes entre
 * quem lê e quem invalida — a causa clássica de "a lista não atualizou".
 */
export const machineKeys = {
  all: ["machines"] as const,
  lists: () => [...machineKeys.all, "list"] as const,
  list: (filter: MachineFilter) => [...machineKeys.lists(), filter] as const,
};

/**
 * Store da feature: dono das chaves de cache e do ciclo de vida do cache.
 *
 * Não conhece React — opera sobre o QueryClient. Os hooks é que fazem a ponte
 * com a árvore de componentes. Também não contém regra de negócio: coordena
 * repositório e cache, nada além disso.
 */
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

  /** Marca as listas como obsoletas — quem estiver montado refaz a busca. */
  async invalidateLists(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: machineKeys.lists() });
  }

  /**
   * Descarta tudo o que a feature guardou. Chamado no logout: sem isso, o
   * próximo usuário a entrar na mesma aba veria as máquinas do anterior.
   */
  clear(): void {
    this.queryClient.removeQueries({ queryKey: machineKeys.all });
  }
}
