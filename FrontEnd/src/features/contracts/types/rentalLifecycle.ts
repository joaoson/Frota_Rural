import type { BadgeConfig } from "@/shared/components/StatusBadge";

/**
 * Leitura única do ciclo de vida, espelho de `rentals/lifecycle.py`.
 *
 * O servidor devolve `phase` e `allowedActions`; as telas decidem contadores,
 * grupos e botões por aqui, em vez de cada painel manter a própria lista de status.
 */
export type RentalPhase =
  | "reserva"
  | "aguardando_pagamento"
  | "aguardando_assinaturas"
  | "pronta_para_entrega"
  | "em_uso"
  | "devolvida"
  | "concluida"
  | "cancelada";

export type RentalAction =
  | "pay"
  | "cancel"
  | "amend"
  | "edit_dates"
  | "sign"
  | "record_check_in"
  | "record_check_out"
  | "complete"
  | "review";

interface LifecycleSource {
  status: string | null;
  phase?: string | null;
  allowedActions?: string[];
}

// Respostas sem `phase` (mocks, caches antigos) caem na leitura aproximada do status.
const PHASE_FROM_STATUS: Record<string, RentalPhase> = {
  pending: "reserva",
  awaiting_payment: "aguardando_pagamento",
  active: "aguardando_assinaturas",
  signed: "pronta_para_entrega",
  completed: "concluida",
  closed: "concluida",
  cancelled: "cancelada",
};

/** Pagas e ainda em andamento: o que os painéis chamam de "locações ativas". */
export const CONFIRMED_PHASES: readonly RentalPhase[] = [
  "aguardando_assinaturas", "pronta_para_entrega", "em_uso", "devolvida",
];
const FINISHED_PHASES: readonly RentalPhase[] = ["concluida", "cancelada"];
const AWAITING_PAYMENT_PHASES: readonly RentalPhase[] = ["reserva", "aguardando_pagamento"];

export function rentalPhase(rental: LifecycleSource): RentalPhase | null {
  return (rental.phase as RentalPhase | null | undefined) ?? PHASE_FROM_STATUS[rental.status ?? ""] ?? null;
}

/** Ainda não encerrada (inclui reservas não pagas). */
export function isOpenRental(rental: LifecycleSource): boolean {
  const phase = rentalPhase(rental);
  return phase !== null && !FINISHED_PHASES.includes(phase);
}

export function isConfirmedRental(rental: LifecycleSource): boolean {
  const phase = rentalPhase(rental);
  return phase !== null && CONFIRMED_PHASES.includes(phase);
}

export function isAwaitingPayment(rental: LifecycleSource): boolean {
  const phase = rentalPhase(rental);
  return phase !== null && AWAITING_PAYMENT_PHASES.includes(phase);
}

/** O servidor decide; sem `allowedActions`, vale a regra antiga por status. */
export function canDo(rental: LifecycleSource, action: RentalAction): boolean {
  if (rental.allowedActions) return rental.allowedActions.includes(action);
  switch (action) {
    case "cancel":
      return rental.status === "pending";
    case "pay":
      return rental.status === "pending" || rental.status === "awaiting_payment";
    case "review":
      return rental.status === "completed";
    default:
      return false;
  }
}

const PHASE_BADGES: Record<RentalPhase, BadgeConfig> = {
  reserva: { icon: "description", variant: "pending", label: "Reserva Pendente" },
  aguardando_pagamento: { icon: "payments", variant: "pending", label: "Aguardando Pagamento" },
  aguardando_assinaturas: { icon: "draw", variant: "pending", label: "Aguardando Assinaturas" },
  pronta_para_entrega: { icon: "verified", variant: "success", label: "Pronta para Entrega" },
  em_uso: { icon: "agriculture", variant: "success", label: "Em Uso" },
  devolvida: { icon: "assignment_return", variant: "neutral", label: "Aguardando Conclusão" },
  concluida: { icon: "check_circle", variant: "success", label: "Concluída" },
  cancelada: { icon: "warning", variant: "error", label: "Locação Cancelada" },
};

export function rentalPhaseBadge(rental: LifecycleSource): BadgeConfig {
  const phase = rentalPhase(rental);
  return phase ? PHASE_BADGES[phase] : { icon: "", variant: "muted", label: "" };
}
