import { useQuery } from "@tanstack/react-query";

import { machineStore } from "@/app/container";

export function useTiposPneu() {
  return useQuery(machineStore.tiposPneuOptions());
}
