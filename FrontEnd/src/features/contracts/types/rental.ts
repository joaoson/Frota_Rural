import type { SignatureRole } from "./rentalSchemas";

export interface Rental {
  id: string;
  postingId: string;
  lesseeId: string;
  lessorId?: string | null;
  operatorId: string | null;
  recurrenceId?: string | null;
  reservationExpiresAt?: Date | null;
  createdAt?: Date | null;
  recurrenceIndex?: number | null;
  lessorName: string | null;
  lesseeName: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  contractNumber: string | null;
  contractId?: string | null;
  startDate: Date | null;
  endDate: Date | null;
  totalPrice: number | null;
  /** Cotação congelada na reserva; o horímetro não altera o valor. */
  dailyRate?: number | null;
  billableDays?: number | null;
  subtotal?: number | null;
  platformFee?: number | null;
  initialHourMeter: number | null;
  finalHourMeter: number | null;
  status: string | null;
  acceptedByLessor: boolean;
  acceptedByLessee: boolean;
  contractStatus: string | null;
}

/** Preço calculado no servidor: diária fixa (tarifa × 8 h) por dia de calendário. */
export interface RentalQuote {
  hourlyRate: number;
  hoursPerDay: number;
  dailyRate: number;
  days: number;
  subtotal: number;
  feeRate: number;
  fee: number;
  total: number;
}

/** Visão pública da disponibilidade, sem dados pessoais da locação. */
export interface RentalOccupancy {
  id: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

const ENCERRADOS = ["completed", "cancelled", "closed"];

/**
 * Situação do contrato do ponto de vista das assinaturas.
 *
 * `status` não basta: vira `active` assim que **qualquer** parte assina, então
 * é o par `acceptedBy*` que diz de quem ainda se espera o aceite.
 */
export function situacaoAssinatura(rental: {
  status: string | null;
  acceptedByLessor: boolean;
  acceptedByLessee: boolean;
}) {
  const encerrado = ENCERRADOS.includes(rental.status ?? "");
  const completo = rental.acceptedByLessor && rental.acceptedByLessee;
  const pagamentoConfirmado = rental.status === "active" || rental.status === "signed";
  return {
    encerrado,
    assinadoPeloLocador: rental.acceptedByLessor,
    assinadoPeloLocatario: rental.acceptedByLessee,
    completo,
    podeAssinarComoLocador: pagamentoConfirmado && !encerrado && !rental.acceptedByLessor,
    podeAssinarComoLocatario: pagamentoConfirmado && !encerrado && !rental.acceptedByLessee,
    grupo: encerrado ? "Encerrados" : completo ? "Assinados" : "Pendentes",
  };
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

export interface SignatureEvidence {
  id: string;
  contractId: string;
  role: SignatureRole;
  signerName: string;
  signerEmail: string;
  documentVersion: string;
  documentHash: string;
  hashAlgorithm: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  otpVerified: boolean;
  previousHash: string;
  recordHash: string;
}

export interface ContractEvidence {
  contractId: string;
  rentalId: string;
  status: string;
  document: { version: string; hash: string; algorithm: string };
  /** Falso quando algum registro foi alterado ou o encadeamento não fecha. */
  chainIntact: boolean;
  inconsistencies: string[];
  signatures: SignatureEvidence[];
  legalBasis: string;
}

export interface SignatureOtp {
  sentTo: string;
  expiresInSeconds: number;
}

export interface SignatureReceipt {
  rental: Rental | null;
  evidence: SignatureEvidence | null;
}

/** Um número legível pode existir mesmo antes da geração do documento. */
export function rentalHasContract(rental: Pick<Rental, "contractId" | "contractStatus">): boolean {
  return Boolean(rental.contractId || rental.contractStatus);
}
