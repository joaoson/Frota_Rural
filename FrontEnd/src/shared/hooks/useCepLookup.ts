import { useMutation } from "@tanstack/react-query";

import { viaCepClient } from "@/app/container";
import type { Address } from "@/shared/http/ViaCepClient";
import { CEP_LENGTH } from "@/shared/http/ViaCepClient";

/**
 * Consulta de endereço por CEP.
 *
 * O mesmo bloco — mascarar, limpar, checar 8 dígitos, buscar, preencher, avisar
 * o usuário — estava repetido em cinco páginas. Agora existe uma vez.
 */
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

/** Já tem dígitos suficientes para valer a consulta? */
export function isCepComplete(rawCep: string): boolean {
  return rawCep.replace(/\D/g, "").length === CEP_LENGTH;
}
