export interface Rental {
  id: string;
  postingId: string;
  lesseeId: string;
  operatorId: string | null;
  lessorName: string | null;
  lesseeName: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  contractNumber: string | null;
  startDate: Date | null;
  endDate: Date | null;
  totalPrice: number | null;
  initialHourMeter: number | null;
  finalHourMeter: number | null;
  status: string | null;
}

export interface Contract {
  id: string;
  rentalId: string;
  documentUrl: string | null;
  acceptedByLessor: boolean | null;
  acceptedByLessee: boolean | null;
  status: string | null;
  rental: Rental | null;
}

export function rentalMachineName(rental: Rental): string {
  const parts = [rental.machineBrand, rental.machineModel].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "Maquinário";
}

export function isFullySigned(contract: Contract): boolean {
  return contract.acceptedByLessor === true && contract.acceptedByLessee === true;
}

export function isSignedBy(contract: Contract, role: "locador" | "locatario"): boolean {
  return role === "locador" ? contract.acceptedByLessor === true : contract.acceptedByLessee === true;
}
