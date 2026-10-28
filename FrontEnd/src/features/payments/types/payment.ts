export type PaymentState = "pending" | "approved" | "expired" | "requires_review" | "refunded" | "partially_refunded";

export interface CheckoutSession {
  /** URL hospedada do Stripe para onde o navegador é redirecionado. */
  url: string;
  amount: string;
}

export interface PaymentStatus {
  status: PaymentState;
  amount: string;
  rentalStatus: string;
}

export function isPaid(payment: PaymentStatus | null | undefined): boolean {
  return payment?.status === "approved";
}
