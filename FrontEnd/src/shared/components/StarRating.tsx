import MaterialIcon from "@/components/MaterialIcon";
import { cn } from "@/lib/utils";

/**
 * Avaliação por estrelas. Unifica três das quatro implementações que existiam:
 * a fileira somente-leitura, o seletor clicável e a contagem da landing.
 *
 * A quarta — o SVG com preenchimento fracionado de `AnuncioDetalhe` — continua
 * separada, porque resolve outro problema (nota decimal).
 */
interface StarRatingProps {
  value: number;
  max?: number;
  size?: number;
  /** Torna as estrelas clicáveis. */
  onChange?: (value: number) => void;
  className?: string;
}

export function StarRating({ value, max = 5, size = 16, onChange, className }: StarRatingProps) {
  const interactive = Boolean(onChange);

  return (
    <div className={cn("flex gap-0.5", className)}>
      {Array.from({ length: max }).map((_, index) => {
        const position = index + 1;
        const filled = position <= value;

        return (
          <MaterialIcon
            key={index}
            icon="star"
            filled={filled}
            size={interactive ? undefined : size}
            onClick={onChange ? () => onChange(position) : undefined}
            className={
              interactive
                ? `text-3xl cursor-pointer hover:scale-110 transition-transform ${
                    filled ? "text-secondary-container" : "text-outline/40"
                  }`
                : filled
                  ? "text-secondary-container"
                  : "text-outline/30"
            }
          />
        );
      })}
    </div>
  );
}
