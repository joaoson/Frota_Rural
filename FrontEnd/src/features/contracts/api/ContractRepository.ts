import type { HttpClient } from "@/shared/http/HttpClient";

import type { ContratoData } from "../types/contractDocument";
import type {
  Contract,
  ContractEvidence,
  Rental,
  SignatureOtp,
  SignatureReceipt,
} from "../types/rental";
import {
  contractApiSchema,
  contractEvidenceApiSchema,
  type CreateRentalPayload,
  rentalApiSchema,
  rentalListApiSchema,
  signatureEvidenceApiSchema,
  signatureOtpApiSchema,
  type SignatureRole,
} from "../types/rentalSchemas";
import {
  contractToDomain,
  rentalToDomain,
  toContractEvidence,
  toSignatureEvidence,
  toSignatureOtp,
} from "./contractMapper";

const RENTALS_PATH = "rentals/";
const CONTRACTS_PATH = "contracts/";

export interface RentalFilter {
  lesseeId?: string;
  lessorId?: string;
}

export interface ContractRepository {
  listRentals(filter: RentalFilter): Promise<Rental[]>;
  findRentalById(id: string): Promise<Rental>;
  listByPosting(postingId: string): Promise<Rental[]>;
  createRental(payload: CreateRentalPayload): Promise<Rental>;
  listContracts(): Promise<Contract[]>;
  findContractDocument(id: string): Promise<ContratoData>;
  sign(id: string, role: SignatureRole, name: string, otp?: string): Promise<SignatureReceipt>;
  requestSignatureOtp(id: string, role: SignatureRole): Promise<SignatureOtp>;
  findEvidence(id: string): Promise<ContractEvidence>;
}

export class HttpContractRepository implements ContractRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async listRentals(filter: RentalFilter): Promise<Rental[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: RENTALS_PATH,
      query: { lessee: filter.lesseeId, lessor: filter.lessorId },
    });
    return rentalListApiSchema.parse(response.data).map(rentalToDomain);
  }

  /** Locações de um anúncio — alimenta o calendário de disponibilidade. */
  async listByPosting(postingId: string): Promise<Rental[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: RENTALS_PATH,
      query: { postings: postingId },
    });
    return rentalListApiSchema.parse(response.data).map(rentalToDomain);
  }

  async findRentalById(id: string): Promise<Rental> {
    const response = await this.http.send<unknown>({ method: "GET", path: `rentals/${id}` });
    return rentalToDomain(rentalApiSchema.parse(response.data));
  }

  async createRental(payload: CreateRentalPayload): Promise<Rental> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: RENTALS_PATH,
      body: payload,
    });
    return rentalToDomain(rentalApiSchema.parse(response.data));
  }

  async listContracts(): Promise<Contract[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: CONTRACTS_PATH });
    return contractApiSchema.array().parse(response.data).map(contractToDomain);
  }

  async findContractDocument(id: string): Promise<ContratoData> {
    const response = await this.http.send<ContratoData>({
      method: "GET",
      path: `contracts/${id}`,
    });
    return response.data;
  }

  /**
   * Registra o aceite. A evidência (hash do documento, timestamp UTC, IP e
   * User-Agent) é gravada pelo servidor em log imutável — nada disso sobe do
   * cliente, justamente para ter valor probatório.
   */
  async sign(
    id: string,
    role: SignatureRole,
    name: string,
    otp?: string,
  ): Promise<SignatureReceipt> {
    const response = await this.http.send<{ signature_evidence?: unknown }>({
      method: "POST",
      path: `contracts/${id}/sign`,
      body: { role, name, ...(otp ? { otp } : {}) },
    });
    const raw = response.data?.signature_evidence;
    return {
      rental: await this.findRentalById(id),
      evidence: raw ? toSignatureEvidence(signatureEvidenceApiSchema.parse(raw)) : null,
    };
  }

  async requestSignatureOtp(id: string, role: SignatureRole): Promise<SignatureOtp> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `contracts/${id}/otp`,
      body: { role },
    });
    return toSignatureOtp(signatureOtpApiSchema.parse(response.data));
  }

  /** Trilha de auditoria completa, com a conferência do encadeamento de hashes. */
  async findEvidence(id: string): Promise<ContractEvidence> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: `contracts/${id}/evidence`,
    });
    return toContractEvidence(contractEvidenceApiSchema.parse(response.data));
  }
}
