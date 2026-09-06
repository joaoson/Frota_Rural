import { useMutation, useQuery } from "@tanstack/react-query";

import { operatorStore } from "@/app/container";

import type { OperatorPayload } from "../api/operatorMapper";
import type { Operator } from "../types/operator";

export function useOperators(enabled = true) {
  return useQuery({ ...operatorStore.listOptions(), enabled });
}

export function useCreateOperator() {
  return useMutation<Operator, Error, OperatorPayload>({
    mutationFn: (payload) => operatorStore.create(payload),
    onSuccess: () => {
      void operatorStore.invalidateLists();
    },
  });
}

export function useUpdateOperator() {
  return useMutation<Operator, Error, { id: string; payload: Partial<OperatorPayload> }>({
    mutationFn: ({ id, payload }) => operatorStore.update(id, payload),
    onSuccess: () => {
      void operatorStore.invalidateLists();
    },
  });
}

export function useUnlinkOperator() {
  return useMutation<void, Error, string>({
    mutationFn: (id) => operatorStore.unlink(id),
    onSuccess: () => {
      void operatorStore.invalidateLists();
    },
  });
}
