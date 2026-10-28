import type { CheckoutSession, PaymentStatus } from "../types/payment";
import type { CheckoutSessionApi, PaymentStatusApi } from "../types/paymentSchemas";

export function toCheckoutSession(dto: CheckoutSessionApi): CheckoutSession {
  return { url: dto.url, amount: dto.amount };
}

export function toPaymentStatus(dto: PaymentStatusApi): PaymentStatus {
  return { status: dto.status, amount: dto.amount, rentalStatus: dto.rental_status };
}
