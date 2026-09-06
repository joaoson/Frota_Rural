import { useMutation, useQuery } from "@tanstack/react-query";

import { contractStore } from "@/app/container";

import type {
  Rental,
  SignatureOtp,
  SignatureReceipt,
} from "../types/rental";
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
  name: string;
  /** Só quando o contrato exige confirmação por código. */
  otp?: string;
}

export function useSignContract() {
  return useMutation<SignatureReceipt, Error, SignContractInput>({
    mutationFn: ({ id, role, name, otp }) => contractStore.sign(id, role, name, otp),
    onSuccess: () => {
      void contractStore.invalidateRentals();
    },
  });
}

export function useRequestSignatureOtp() {
  return useMutation<SignatureOtp, Error, { id: string; role: SignatureRole }>({
    mutationFn: ({ id, role }) => contractStore.requestSignatureOtp(id, role),
  });
}

export function useContractEvidence(id: string | null) {
  return useQuery({ ...contractStore.evidenceOptions(id ?? ""), enabled: Boolean(id) });
}
