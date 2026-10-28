import { useQuery } from "@tanstack/react-query";

import { documentStore } from "@/app/container";

export function useAreasCertificacao() {
  return useQuery(documentStore.areasCertificacaoOptions());
}
