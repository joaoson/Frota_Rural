import { useQuery } from "@tanstack/react-query";

import { reviewStore } from "@/app/container";

export function useCriteriosAvaliacao() {
  return useQuery(reviewStore.criteriosOptions());
}
