import type { BadgeConfig } from "@/shared/components/StatusBadge";

export function userStatusBadge(status: string | null): BadgeConfig {
  switch (status) {
    case "active":
      return { icon: "check_circle", variant: "success", label: "Ativo" };
    case "warned":
      return { icon: "warning", variant: "pending", label: "Advertido" };
    case "suspended":
      return { icon: "pause_circle", variant: "neutral", label: "Suspenso" };
    case "banned":
      return { icon: "block", variant: "error", label: "Banido" };
    default:
      return { icon: "circle", variant: "muted", label: status || "—" };
  }
}
