import { z } from "zod";

export const checkoutSessionApiSchema = z.object({
  url: z.string(),
  amount: z.string(),
});

// `rental_status` acompanha o pagamento: é ele que libera a locação.
export const paymentStatusApiSchema = z.object({
  status: z.enum(["pending", "approved", "expired"]),
  amount: z.string(),
  rental_status: z.string(),
});

export type CheckoutSessionApi = z.infer<typeof checkoutSessionApiSchema>;
export type PaymentStatusApi = z.infer<typeof paymentStatusApiSchema>;
