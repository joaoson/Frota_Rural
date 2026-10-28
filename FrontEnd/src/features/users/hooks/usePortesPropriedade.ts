import { useQuery } from "@tanstack/react-query";

import { userStore } from "@/app/container";

export function usePortesPropriedade() {
  return useQuery(userStore.portesPropriedadeOptions());
}
