import type { BadgeConfig } from "@/shared/components/StatusBadge";

/** Abaixo disto o modelo recusa (nota de "dado falso" >= 0,60 no backend). */
export const VERACITY_LOW_MAX = 40;
export const VERACITY_HIGH_MIN = 71;

export interface VeracityBand {
  badge: BadgeConfig;
  /** Classe de cor da barra de progresso. */
  bar: string;
  hint: string;
}

export function veracityBand(score: number): VeracityBand {
  if (score <= VERACITY_LOW_MAX) {
    return {
      badge: { icon: "error", variant: "error", label: "Baixa" },
      bar: "bg-error",
      hint: "Os dados provavelmente não são verdadeiros ou não conferem com o documento.",
    };
  }
  if (score < VERACITY_HIGH_MIN) {
    return {
      badge: { icon: "warning", variant: "pending", label: "Média" },
      bar: "bg-secondary",
      hint: "Há sinais de inconsistência. Confira os dados com o documento anexado.",
    };
  }
  return {
    badge: { icon: "verified", variant: "success", label: "Alta" },
    bar: "bg-primary",
    hint: "Os dados parecem verdadeiros e, quando lido, conferem com o documento.",
  };
}

export function documentStatusBadge(status: string): BadgeConfig {
  switch (status) {
    case "approved":
      return { icon: "check_circle", variant: "success", label: "Aprovado" };
    case "rejected":
      return { icon: "block", variant: "error", label: "Recusado" };
    default:
      return { icon: "hourglass_bottom", variant: "pending", label: "Pendente" };
  }
}
