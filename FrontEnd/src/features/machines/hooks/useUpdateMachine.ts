import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractStore, machineStore } from "@/app/container";
import { postingKeys } from "@/features/postings/api/PostingStore";
import type { CreateMachinePayload } from "../types/machineSchemas";

export function useUpdateMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMachinePayload> }) =>
      machineStore.update(id, payload),
    onSuccess: () => Promise.all([machineStore.invalidateLists(), contractStore.invalidateRentals(), queryClient.invalidateQueries({ queryKey: postingKeys.all })]),
  });
}
