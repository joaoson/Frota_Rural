import MaterialIcon from "@/components/MaterialIcon";

/**
 * Selo de status. O componente é genérico; a tradução
 * `status → {ícone, variante, rótulo}` é regra de domínio e vive em cada
 * feature (em `types/<dominio>Badges.ts`), para que `shared/` não precise
 * conhecer os estados de nenhum domínio.
 *
 * Substitui 6 implementações de `statusBadge`/`getStatusBadge` e o `<span>` de
 * render que estava repetido 6 vezes.
 */
export type BadgeVariant = "success" | "pending" | "error" | "neutral" | "muted";

const VARIANTS: Record<BadgeVariant, string> = {
  success: "bg-primary/10 text-primary border border-primary/20",
  pending: "bg-secondary-container/20 text-secondary border border-secondary-container/30",
  error: "bg-error/10 text-error border border-error/20",
  neutral: "bg-surface-container-high text-on-surface-variant border border-outline-variant/40",
  muted: "bg-muted text-muted-foreground border border-outline-variant/30",
};

export interface BadgeConfig {
  icon: string;
  variant: BadgeVariant;
  label: string;
}

interface StatusBadgeProps {
  config: BadgeConfig;
  /** Variante compacta das tabelas de moderação. */
  dense?: boolean;
  iconSize?: number;
  className?: string;
}

export function StatusBadge({ config, dense = false, iconSize = 14, className }: StatusBadgeProps) {
  const box = dense
    ? "px-2.5 py-1 inline-flex"
    : "px-3 py-1.5 flex";

  return (
    <span
      className={`${box} font-bold text-[10px] rounded uppercase tracking-wider items-center gap-1.5 ${
        VARIANTS[config.variant]
      }${className ? ` ${className}` : ""}`}
    >
      {config.icon && <MaterialIcon icon={config.icon} size={iconSize} />} {config.label}
    </span>
  );
}
