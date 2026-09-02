/**
 * Estado de erro de carregamento. Havia três cópias, uma delas com fundo,
 * arredondamento e opacidade de borda diferentes sem motivo.
 */
interface ErrorStateProps {
  title?: string;
  message?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Erro ao carregar",
  message,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={`text-center py-20 bg-error-container rounded-2xl border border-error/20${
        className ? ` ${className}` : ""
      }`}
    >
      <p className="text-error font-bold mb-2">{title}</p>
      {message && <p className="text-on-surface-variant text-sm max-w-sm mx-auto">{message}</p>}
    </div>
  );
}
