import { useQuery } from "@tanstack/react-query";

import { machineStore } from "@/app/container";

import type { MachineFilter } from "../api/MachineRepository";

export function useMachines(filter: MachineFilter = {}, enabled = true) {
  return useQuery({ ...machineStore.listOptions(filter), enabled });
}
