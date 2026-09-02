import type { BadgeConfig } from "@/shared/components/StatusBadge";

/** Status de revisão do documento do operador → selo. */
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
