import type { BadgeConfig } from "@/shared/components/StatusBadge";

export function rentalStatusBadge(status: string | null): BadgeConfig {
  switch (status) {
    case "pending":
      return { icon: "description", variant: "pending", label: "Assinatura Pendente" };
    case "active":
      return { icon: "circle", variant: "success", label: "Em Operação (Ativo)" };
    case "completed":
      return { icon: "check_circle", variant: "success", label: "Concluída" };
    case "cancelled":
      return { icon: "warning", variant: "error", label: "Locação Cancelada" };
    case "validating":
      return { icon: "hourglass_bottom", variant: "neutral", label: "Aguardando Validação" };
    default:
      return { icon: "", variant: "muted", label: "" };
  }
}
