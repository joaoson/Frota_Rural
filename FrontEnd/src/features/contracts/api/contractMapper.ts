import type {
  Contract,
  ContractEvidence,
  Rental,
  SignatureEvidence,
  SignatureOtp,
} from "../types/rental";
import type {
  ContractApi,
  ContractEvidenceApi,
  RentalApi,
  SignatureEvidenceApi,
  SignatureOtpApi,
} from "../types/rentalSchemas";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function rentalToDomain(dto: RentalApi): Rental {
  return {
    id: dto.id,
    postingId: dto.postings,
    lesseeId: dto.lessee,
    operatorId: dto.operator ?? null,
    lessorName: dto.lessor_name ?? null,
    lesseeName: dto.lessee_name ?? null,
    machineBrand: dto.machine_brand ?? null,
    machineModel: dto.machine_model ?? null,
    contractNumber: dto.contract_number ?? null,
    startDate: toDate(dto.start_date),
    endDate: toDate(dto.end_date),
    totalPrice: toNumber(dto.total_price),
    initialHourMeter: dto.initial_hour_meter ?? null,
    finalHourMeter: dto.final_hour_meter ?? null,
    status: dto.status ?? null,
    acceptedByLessor: Boolean(dto.accepted_by_lessor),
    acceptedByLessee: Boolean(dto.accepted_by_lessee),
    contractStatus: dto.contract_status ?? null,
  };
}

export function contractToDomain(dto: ContractApi): Contract {
  return {
    id: dto.id,
    rentalId: dto.rental,
    documentUrl: dto.document_url ?? null,
    acceptedByLessor: dto.accepted_by_lessor ?? null,
    acceptedByLessee: dto.accepted_by_lessee ?? null,
    status: dto.status ?? null,
    rental: dto.rental_details ? rentalToDomain(dto.rental_details) : null,
  };
}

export function toRentalDateTime(date: string, time: "start" | "end"): string {
  return `${date}T${time === "start" ? "08:00:00" : "18:00:00"}Z`;
}

export function toSignatureEvidence(dto: SignatureEvidenceApi): SignatureEvidence {
  return {
    id: dto.id,
    contractId: dto.contract,
    role: dto.role,
    signerName: dto.signer_name,
    signerEmail: dto.signer_email,
    documentVersion: dto.document_version,
    documentHash: dto.document_hash,
    hashAlgorithm: dto.hash_algorithm,
    signedAt: dto.signed_at,
    ipAddress: dto.ip_address,
    userAgent: dto.user_agent,
    otpVerified: dto.otp_verified,
    previousHash: dto.previous_hash,
    recordHash: dto.record_hash,
  };
}

export function toContractEvidence(dto: ContractEvidenceApi): ContractEvidence {
  return {
    contractId: dto.contrato_id,
    rentalId: dto.aluguel_id,
    status: dto.status,
    document: {
      version: dto.documento.versao,
      hash: dto.documento.hash,
      algorithm: dto.documento.algoritmo,
    },
    chainIntact: dto.cadeia_integra,
    inconsistencies: dto.inconsistencias,
    signatures: dto.assinaturas.map(toSignatureEvidence),
    legalBasis: dto.fundamento_legal,
  };
}

export function toSignatureOtp(dto: SignatureOtpApi): SignatureOtp {
  return { sentTo: dto.sent_to, expiresInSeconds: dto.expires_in_seconds };
}
