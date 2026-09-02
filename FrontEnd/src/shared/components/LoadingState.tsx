import MaterialIcon from "@/components/MaterialIcon";

/**
 * Estado de carregamento.
 *
 * Existiam **cinco** tratamentos diferentes no projeto: spinner de borda,
 * spinner de ícone `sync`, texto centralizado, linha de tabela e um spinner
 * pequeno inline — inclusive com reticências diferentes ("..." vs "…").
 */
interface LoadingStateProps {
  /** Texto abaixo/no lugar do spinner. */
  label?: string;
  variant?: "spinner" | "text" | "inline";
  className?: string;
}

export function LoadingState({ label, variant = "spinner", className }: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 px-1${className ? ` ${className}` : ""}`}>
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {label && <span className="text-sm text-on-surface-variant">{label}</span>}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`text-center py-20${className ? ` ${className}` : ""}`}>
        <p className="text-on-surface-variant text-sm">{label ?? "Carregando..."}</p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center py-32${className ? ` ${className}` : ""}`}
    >
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      {label && <p className="text-on-surface-variant font-medium mt-4">{label}</p>}
    </div>
  );
}

/** Tela cheia — usada quando a página inteira ainda não tem dados. */
export function FullPageLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <MaterialIcon icon="sync" className="animate-spin text-primary mb-4" size={32} />
      <p className="text-on-surface-variant font-medium">{label}</p>
    </div>
  );
}
