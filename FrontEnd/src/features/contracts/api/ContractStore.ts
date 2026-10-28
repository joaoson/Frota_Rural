import type { AmendmentInput, AmendmentDecision, CancellationQuote } from "../types/management";
import { notificationKeys } from "@/features/notifications/api/NotificationStore";
import { dashboardKeys } from "@/features/dashboard/api/DashboardStore";
import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { ContratoData } from "../types/contractDocument";
import type {
  BookingPolicy,
  ContractEvidence,
  MachineUsage,
  MeterReadingKind,
  MeterRecordResult,
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
  machineUsage: (machineId: string) => [...contractKeys.all, "machine-usage", machineId] as const,
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

  /** Antecedência mínima do servidor, a mesma para reserva, troca de datas e recorrência. */
  bookingPolicy(): Promise<BookingPolicy> {
    return this.repository.bookingPolicy();
  }

  async recordMeterReading(id: string, kind: MeterReadingKind, value: number, note?: string): Promise<MeterRecordResult> {
    const result = await this.repository.recordMeterReading(id, kind, value, note);
    void this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return result;
  }

  async completeRental(id: string, finalHourMeter?: number): Promise<Rental> {
    const rental = await this.repository.completeRental(id, finalHourMeter);
    void this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    void this.queryClient.invalidateQueries({ queryKey: [...contractKeys.all, "machine-usage"] });
    return rental;
  }

  machineUsageOptions(machineId: string): UseQueryOptions<MachineUsage, Error, MachineUsage, ReturnType<typeof contractKeys.machineUsage>> {
    return { queryKey: contractKeys.machineUsage(machineId), queryFn: () => this.repository.machineUsage(machineId) };
  }

  findRentalById(id: string): Promise<Rental> {
    return this.repository.findRentalById(id);
  }

  findContractDocument(id: string): Promise<ContratoData> {
    return this.repository.findContractDocument(id);
  }

  async cancelRental(id: string, reason = ""): Promise<Rental> {
    const rental = await this.repository.cancelRental(id, reason);
    await this.invalidateRentals();
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.all });
    return rental;
  }

  previewCancellation(id: string): Promise<CancellationQuote> {
    return this.repository.previewCancellation(id);
  }

  amendmentsOptions(id: string) {
    return { queryKey: [...contractKeys.all, "amendments", id], queryFn: () => this.repository.listAmendments(id) };
  }

  async proposeAmendment(id: string, input: AmendmentInput) {
    const result = await this.repository.proposeAmendment(id, input);
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.all });
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return result;
  }

  async decideAmendment(id: string, amendmentId: string, decision: AmendmentDecision) {
    const result = await this.repository.decideAmendment(id, amendmentId, decision);
    void this.queryClient.invalidateQueries({ queryKey: contractKeys.all });
    void this.queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return result;
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
    // Os indicadores do painel são agregados das mesmas locações.
    await Promise.all([
      this.queryClient.invalidateQueries({ queryKey: contractKeys.rentals() }),
      this.queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    ]);
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: contractKeys.all });
  }
}
