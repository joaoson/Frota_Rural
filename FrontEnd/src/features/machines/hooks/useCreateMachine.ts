import { useMutation } from "@tanstack/react-query";

import { machineStore } from "@/app/container";

import type { Machine } from "../types/machine";
import type { CreateMachinePayload } from "../types/machineSchemas";

/**
 * Adapter entre o caso de uso "cadastrar máquina" e o React.
 *
 * O erro NÃO é tratado aqui: sobe tipado (BadRequestError e afins) para a
 * página decidir se vira mensagem de campo ou toast. Escolher texto de UI é
 * responsabilidade da apresentação.
 */
export function useCreateMachine() {
  return useMutation<Machine, Error, CreateMachinePayload>({
    mutationFn: (payload) => machineStore.create(payload),
    onSuccess: () => {
      void machineStore.invalidateLists();
    },
  });
}
