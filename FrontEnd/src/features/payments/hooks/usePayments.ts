import { useMutation, useQuery } from "@tanstack/react-query";

import { paymentStore } from "@/app/container";

import type { CheckoutSession } from "../types/payment";

/**
 * O Stripe confirma o pagamento por webhook, então a tela precisa reconsultar
 * enquanto estiver `pending` — daí o intervalo enquanto não aprova.
 */
export function usePaymentStatus(rentalId: string | null, pollMs = 4000) {
  return useQuery({
    ...paymentStore.statusOptions(rentalId ?? ""),
    enabled: Boolean(rentalId),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? pollMs : false),
  });
}

export function useCreateCheckout() {
  return useMutation<CheckoutSession, Error, string>({
    mutationFn: (rentalId) => paymentStore.createCheckout(rentalId),
  });
}
