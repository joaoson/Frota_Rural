import { useMutation } from "@tanstack/react-query";

import { machineStore } from "@/app/container";

import type { Machine } from "../types/machine";
import type { CreateMachinePayload } from "../types/machineSchemas";

export function useCreateMachine() {
  return useMutation<Machine, Error, CreateMachinePayload>({
    mutationFn: (payload) => machineStore.create(payload),
    onSuccess: () => {
      void machineStore.invalidateLists();
    },
  });
}
