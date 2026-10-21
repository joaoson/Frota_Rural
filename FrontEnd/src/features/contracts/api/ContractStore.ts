import { notificationKeys } from "@/features/notifications/api/NotificationStore";
import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { ContratoData } from "../types/contractDocument";
import type {
  ContractEvidence,
  Rental,
  RentalOccupancy,
  RentalQuote,
  SignatureOtp,
  SignatureReceipt,
} from "../types/rental";
import type { CreateRentalPayload, SignatureRole } from "../types/rentalSchemas";
import type { ContractRepository, RentalFilter } from "./ContractRepository";

import type { RecurrenceInput, CreateRecurrenceInput, RecurrencePreview, RecurrenceCreated } from "../types/recurrence";

export const contractKeys = {
  all: ["contracts"] as const,
  rentals: () => [...contractKeys.all, "rentals"] as const,
  rentalList: (filter: RentalFilter) => [...contractKeys.rentals(), filter] as const,
  document: (id: string) => [...contractKeys.all, "document", id] as const,
  evidence: (id: string) => [...contractKeys.all, "evidence", id] as const,
};

export class ContractStore {
  private readonly repository: ContractRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: ContractRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  rentalListOptions(
    filter: RentalFilter,
  ): UseQueryOptions<Rental[], Error, Rental[], ReturnType<typeof contractKeys.rentalList>> {
    return {
      queryKey: contractKeys.rentalList(filter),
      queryFn: () => this.repository.listRentals(filter),
    };
  }

  documentOptions(
    id: string,
  ): UseQueryOptions<ContratoData, Error, ContratoData, ReturnType<typeof contractKeys.document>> {
    return {
      queryKey: contractKeys.document(id),
      queryFn: () => this.repository.findContractDocument(id),
    };
  }

  listByPosting(postingId: string): Promise<Rental[]> {
    return this.repository.listByPosting(postingId);
  }

  listOccupancyByPosting(postingId: string): Promise<RentalOccupancy[]> {
    return this.repository.listOccupancyByPosting(postingId);
  }

  /** Valor do servidor para o período; é o mesmo que a reserva congela. */
  quotePosting(postingId: string, startDate: string, endDate: string): Promise<RentalQuote> {
    return this.repository.quotePosting(postingId, startDate, endDate);
  }

  findRentalById(id: string): Promise<Rental> {
    return this.repository.findRentalById(id);
  }

  findContractDocument(id: string): Promise<ContratoData> {
    return this.repository.findContractDocument(id);
  }

  async cancelRental(id: string): Promise<Rental> {
    const rental = await this.repository.cancelRental(id);
    await this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.document(id) });
    return rental;
  }

  async createRental(payload: CreateRentalPayload): Promise<Rental> {
    const rental = await this.repository.createRental(payload);
    void this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return rental;
  }

  previewRecurrence(id: string, payload: RecurrenceInput): Promise<RecurrencePreview> {
    return this.repository.previewRecurrence(id, payload);
  }

  async createRecurrence(id: string, payload: CreateRecurrenceInput): Promise<RecurrenceCreated> {
    const result = await this.repository.createRecurrence(id, payload);
    void this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return result;
  }

  async sign(
    id: string, role: SignatureRole, name: string, otp?: string, revisionId?: string | null,
  ): Promise<SignatureReceipt> {
    const receipt = await this.repository.sign(id, role, name, otp, revisionId);
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    void this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.document(id) });
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.evidence(id) });
    return receipt;
  }

  requestSignatureOtp(id: string, role: SignatureRole, revisionId?: string | null): Promise<SignatureOtp> {
    return this.repository.requestSignatureOtp(id, role, revisionId);
  }

  evidenceOptions(
    id: string,
  ): UseQueryOptions<
    ContractEvidence,
    Error,
    ContractEvidence,
    ReturnType<typeof contractKeys.evidence>
  > {
    return {
      queryKey: contractKeys.evidence(id),
      queryFn: () => this.repository.findEvidence(id),
    };
  }

  async invalidateRentals(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: contractKeys.rentals() });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: contractKeys.all });
  }
}
