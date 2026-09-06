import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

import type { CheckoutSession, PaymentStatus } from "../types/payment";
import type { PaymentRepository } from "./PaymentRepository";

export const paymentKeys = {
  all: ["payments"] as const,
  status: (rentalId: string) => [...paymentKeys.all, "status", rentalId] as const,
};

export class PaymentStore {
  private readonly repository: PaymentRepository;
  private readonly queryClient: QueryClient;

  constructor(repository: PaymentRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }

  statusOptions(
    rentalId: string,
  ): UseQueryOptions<PaymentStatus, Error, PaymentStatus, ReturnType<typeof paymentKeys.status>> {
    return {
      queryKey: paymentKeys.status(rentalId),
      queryFn: () => this.repository.getStatus(rentalId),
    };
  }

  getStatus(rentalId: string): Promise<PaymentStatus> {
    return this.repository.getStatus(rentalId);
  }

  createCheckout(rentalId: string): Promise<CheckoutSession> {
    return this.repository.createCheckout(rentalId);
  }

  async invalidateStatus(rentalId: string): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: paymentKeys.status(rentalId) });
  }

  clear(): void {
    this.queryClient.removeQueries({ queryKey: paymentKeys.all });
  }
}
