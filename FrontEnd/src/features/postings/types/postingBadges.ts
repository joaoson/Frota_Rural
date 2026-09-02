import type { BadgeConfig } from "@/shared/components/StatusBadge";

/** Status do anúncio → selo. */
export function postingStatusBadge(status: string | null): BadgeConfig {
  switch (status) {
    case "active":
      return { icon: "check_circle", variant: "success", label: "Ativo" };
    case "rejected":
      return { icon: "block", variant: "error", label: "Reprovado" };
    case "pending_review":
      return { icon: "hourglass_bottom", variant: "pending", label: "Em análise" };
    case "suspended":
      return { icon: "pause_circle", variant: "neutral", label: "Suspenso" };
    case "inactive":
      return { icon: "visibility_off", variant: "neutral", label: "Inativo" };
    default:
      return { icon: "circle", variant: "muted", label: status || "—" };
  }
}
