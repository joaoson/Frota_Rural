import type { BadgeConfig } from "@/shared/components/StatusBadge";

export function rentalStatusBadge(status: string | null): BadgeConfig {
  switch (status) {
    case "pending":
      return { icon: "description", variant: "pending", label: "Reserva Pendente" };
    case "awaiting_payment":
      return { icon: "payments", variant: "pending", label: "Aguardando Pagamento" };
    case "signed":
      return { icon: "verified", variant: "success", label: "Contrato Assinado" };
    case "active":
      return { icon: "circle", variant: "success", label: "Locação Ativa" };
    case "closed":
      return { icon: "check_circle", variant: "success", label: "Encerrada" };
    case "completed":
      return { icon: "check_circle", variant: "success", label: "Concluída" };
    case "cancelled":
      return { icon: "warning", variant: "error", label: "Locação Cancelada" };
    default:
      return { icon: "", variant: "muted", label: "" };
  }
}
