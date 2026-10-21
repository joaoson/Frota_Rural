import type { HttpClient } from "@/shared/http/HttpClient";

import type { ContratoData } from "../types/contractDocument";
import type {
  Contract,
  ContractEvidence,
  Rental,
  RentalOccupancy,
  RentalQuote,
  SignatureOtp,
  SignatureReceipt,
} from "../types/rental";
import {
  contractApiSchema,
  contractEvidenceApiSchema,
  type CreateRentalPayload,
  rentalApiSchema,
  rentalListApiSchema,
  rentalOccupancyApiSchema,
  rentalQuoteApiSchema,
  signatureEvidenceApiSchema,
  signatureOtpApiSchema,
  type SignatureRole,
} from "../types/rentalSchemas";
import {
  contractToDomain,
  quoteToDomain,
  rentalToDomain,
  toContractEvidence,
  toSignatureEvidence,
  toSignatureOtp,
} from "./contractMapper";

import { recurrencePreviewSchema, recurrenceCreatedSchema, type RecurrenceInput, type CreateRecurrenceInput, type RecurrencePreview, type RecurrenceCreated } from "../types/recurrence";

const RENTALS_PATH = "rentals";
const CONTRACTS_PATH = "contracts";

export interface RentalFilter {
  lesseeId?: string;
  lessorId?: string;
}

export interface ContractRepository {
  listRentals(filter: RentalFilter): Promise<Rental[]>;
  findRentalById(id: string): Promise<Rental>;
  cancelRental(id: string): Promise<Rental>;
  listByPosting(postingId: string): Promise<Rental[]>;
  listOccupancyByPosting(postingId: string): Promise<RentalOccupancy[]>;
  quotePosting(postingId: string, startDate: string, endDate: string): Promise<RentalQuote>;
  createRental(payload: CreateRentalPayload): Promise<Rental>;
  previewRecurrence(id: string, payload: RecurrenceInput): Promise<RecurrencePreview>;
  createRecurrence(id: string, payload: CreateRecurrenceInput): Promise<RecurrenceCreated>;
  listContracts(): Promise<Contract[]>;
  findContractDocument(id: string): Promise<ContratoData>;
  sign(id: string, role: SignatureRole, name: string, otp?: string, revisionId?: string | null): Promise<SignatureReceipt>;
  requestSignatureOtp(id: string, role: SignatureRole, revisionId?: string | null): Promise<SignatureOtp>;
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

  async listOccupancyByPosting(postingId: string): Promise<RentalOccupancy[]> {
    const response = await this.http.send<unknown>({
      method: "GET", path: `postings/${postingId}/ocupacao`,
    });
    return rentalOccupancyApiSchema.parse(response.data).ocupados.map((item) => ({
      id: item.id, status: item.status, startDate: new Date(item.start_date), endDate: new Date(item.end_date),
    }));
  }

  async quotePosting(postingId: string, startDate: string, endDate: string): Promise<RentalQuote> {
    const response = await this.http.send<unknown>({
      method: "GET", path: `postings/${postingId}/cotacao`,
      query: { start_date: startDate, end_date: endDate },
    });
    return quoteToDomain(rentalQuoteApiSchema.parse(response.data));
  }

  async findRentalById(id: string): Promise<Rental> {
    const response = await this.http.send<unknown>({ method: "GET", path: `rentals/${id}` });
    return rentalToDomain(rentalApiSchema.parse(response.data));
  }

  async cancelRental(id: string): Promise<Rental> {
    const response = await this.http.send<unknown>({
      method: "PATCH", path: `rentals/${id}`, body: { status: "cancelled" },
    });
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

  async previewRecurrence(id: string, payload: RecurrenceInput): Promise<RecurrencePreview> {
    const response = await this.http.send<unknown>({
      method: "POST", path: `rentals/${id}/recurrence/preview`, body: payload,
    });
    return recurrencePreviewSchema.parse(response.data);
  }

  async createRecurrence(id: string, payload: CreateRecurrenceInput): Promise<RecurrenceCreated> {
    const response = await this.http.send<unknown>({
      method: "POST", path: `rentals/${id}/recurrence`, body: payload,
    });
    const dto = recurrenceCreatedSchema.parse(response.data);
    return { ...dto, rentals: dto.rentals.map(rentalToDomain) };
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
   * cliente, justamente para ter valor probatório. `revisionId` é a revisão que
   * a parte leu: se ela mudou, o servidor recusa com `stale_revision`.
   */
  async sign(
    id: string,
    role: SignatureRole,
    name: string,
    otp?: string,
    revisionId?: string | null,
  ): Promise<SignatureReceipt> {
    const response = await this.http.send<{ signature_evidence?: unknown; rental_details?: unknown }>({
      method: "POST",
      path: `contracts/${id}/sign`,
      body: { role, name, revision_id: revisionId ?? null, ...(otp ? { otp } : {}) },
    });
    const raw = response.data?.signature_evidence;
    // A locação já vem na resposta: uma segunda leitura que falhasse faria um
    // aceite gravado parecer recusado.
    const rental = rentalApiSchema.safeParse(response.data?.rental_details);
    return {
      rental: rental.success ? rentalToDomain(rental.data) : null,
      evidence: raw ? toSignatureEvidence(signatureEvidenceApiSchema.parse(raw)) : null,
    };
  }

  async requestSignatureOtp(id: string, role: SignatureRole, revisionId?: string | null): Promise<SignatureOtp> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: `contracts/${id}/otp`,
      body: { role, revision_id: revisionId ?? null },
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
