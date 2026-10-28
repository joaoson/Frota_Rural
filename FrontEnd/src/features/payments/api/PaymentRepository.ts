import type { HttpClient } from "@/shared/http/HttpClient";

import type { CheckoutSession, PaymentStatus } from "../types/payment";
import { checkoutSessionApiSchema, paymentStatusApiSchema } from "../types/paymentSchemas";
import { toCheckoutSession, toPaymentStatus } from "./paymentMapper";

// Nenhuma rota de pagamento leva barra final.
const CHECKOUT = (rentalId: string) => `rentals/${rentalId}/checkout`;
const PAYMENT = (rentalId: string) => `rentals/${rentalId}/payment`;

export interface PaymentRepository {
  createCheckout(rentalId: string): Promise<CheckoutSession>;
  getStatus(rentalId: string): Promise<PaymentStatus>;
}

export class HttpPaymentRepository implements PaymentRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async createCheckout(rentalId: string): Promise<CheckoutSession> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: CHECKOUT(rentalId),
    });
    return toCheckoutSession(checkoutSessionApiSchema.parse(response.data));
  }

  async getStatus(rentalId: string): Promise<PaymentStatus> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: PAYMENT(rentalId),
    });
    return toPaymentStatus(paymentStatusApiSchema.parse(response.data));
  }
}
