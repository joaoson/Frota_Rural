export interface Machine {
  id: string;
  ownerId: string;
  renagroNumber: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  technicalSpecifications: string | null;
  usagePurpose: string | null;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export function machineDisplayName(machine: Machine): string {
  const parts = [machine.brand, machine.model].filter(
    (part): part is string => Boolean(part),
  );
  if (parts.length > 0) return parts.join(" ");
  return machine.renagroNumber ?? machine.id;
}

export function isMachineActive(machine: Machine): boolean {
  return machine.status === "active";
}
