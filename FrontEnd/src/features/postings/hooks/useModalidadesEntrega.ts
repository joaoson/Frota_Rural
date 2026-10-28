import { useQuery } from "@tanstack/react-query";

import { postingStore } from "@/app/container";

export function useModalidadesEntrega() {
  return useQuery(postingStore.modalidadesEntregaOptions());
}
