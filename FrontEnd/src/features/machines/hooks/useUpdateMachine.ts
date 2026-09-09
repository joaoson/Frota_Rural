import { useMutation } from "@tanstack/react-query";
import { machineStore } from "@/app/container";
import type { CreateMachinePayload } from "../types/machineSchemas";

export function useUpdateMachine() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMachinePayload> }) =>
      machineStore.update(id, payload),
    onSuccess: () => machineStore.invalidateLists(),
  });
}
