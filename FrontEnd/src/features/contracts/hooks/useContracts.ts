import { useMutation, useQuery } from "@tanstack/react-query";

import { contractStore } from "@/app/container";

import type { Contract, Rental } from "../types/rental";
import type { CreateRentalPayload, SignatureRole } from "../types/rentalSchemas";

export function useRentalsAsLessee(userId: string | null) {
  return useQuery({
    ...contractStore.rentalListOptions({ lesseeId: userId ?? undefined }),
    enabled: Boolean(userId),
  });
}

export function useRentalsAsLessor(userId: string | null) {
  return useQuery({
    ...contractStore.rentalListOptions({ lessorId: userId ?? undefined }),
    enabled: Boolean(userId),
  });
}

export function useContractDocument(id: string | null) {
  return useQuery({
    ...contractStore.documentOptions(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useCreateRental() {
  return useMutation<Rental, Error, CreateRentalPayload>({
    mutationFn: (payload) => contractStore.createRental(payload),
    onSuccess: () => {
      void contractStore.invalidateRentals();
    },
  });
}

export interface SignContractInput {
  id: string;
  role: SignatureRole;
  name?: string;
}

export function useSignContract() {
  return useMutation<Contract, Error, SignContractInput>({
    mutationFn: ({ id, role, name }) => contractStore.sign(id, role, name),
    onSuccess: () => {
      void contractStore.invalidateRentals();
    },
  });
}
