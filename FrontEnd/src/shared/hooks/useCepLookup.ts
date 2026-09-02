import { useMutation } from "@tanstack/react-query";

import { viaCepClient } from "@/app/container";
import type { Address } from "@/shared/http/ViaCepClient";
import { CEP_LENGTH } from "@/shared/http/ViaCepClient";

export function useCepLookup() {
  const mutation = useMutation<Address, Error, string>({
    mutationFn: (cep) => viaCepClient.findByCep(cep),
  });

  return {
    lookup: mutation.mutateAsync,
    address: mutation.data ?? null,
    isLooking: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export function isCepComplete(rawCep: string): boolean {
  return rawCep.replace(/\D/g, "").length === CEP_LENGTH;
}
