import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { ContratoData } from "../types/contractDocument";
import type { Contract, Rental } from "../types/rental";
import type { CreateRentalPayload, SignatureRole } from "../types/rentalSchemas";
import type { ContractRepository, RentalFilter } from "./ContractRepository";

export const contractKeys = {
  all: ["contracts"] as const,
  rentals: () => [...contractKeys.all, "rentals"] as const,
  rentalList: (filter: RentalFilter) => [...contractKeys.rentals(), filter] as const,
  document: (id: string) => [...contractKeys.all, "document", id] as const,
};

export class ContractStore {
  private readonly repository: ContractRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: ContractRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  rentalListOptions(
    filter: RentalFilter,
  ): UseQueryOptions<Rental[], Error, Rental[], ReturnType<typeof contractKeys.rentalList>> {
    return {
      queryKey: contractKeys.rentalList(filter),
      queryFn: () => this.repository.listRentals(filter),
    };
  }

  documentOptions(
    id: string,
  ): UseQueryOptions<ContratoData, Error, ContratoData, ReturnType<typeof contractKeys.document>> {
    return {
      queryKey: contractKeys.document(id),
      queryFn: () => this.repository.findContractDocument(id),
    };
  }

  createRental(payload: CreateRentalPayload): Promise<Rental> {
    return this.repository.createRental(payload);
  }

  sign(id: string, role: SignatureRole, name?: string): Promise<Contract> {
    return this.repository.sign(id, role, name);
  }

  async invalidateRentals(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: contractKeys.rentals() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: contractKeys.all });
  }
}
