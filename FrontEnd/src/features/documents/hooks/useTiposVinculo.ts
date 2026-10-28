import { useQuery } from "@tanstack/react-query";

import { documentStore } from "@/app/container";

export function useTiposVinculo() {
  return useQuery(documentStore.tiposVinculoOptions());
}
