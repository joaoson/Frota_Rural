/**
 * Bloco label + campo + mensagem de erro/dica.
 *
 * Substitui ~65 ocorrências espalhadas por 10 arquivos, e as **sete cópias byte
 * a byte idênticas** de `INPUT_BASE` + `inputClass()` que existiam nas páginas.
 */

import { cn } from "@/lib/utils";

import { FIELD_LABEL } from "./inputStyles";

interface FormFieldProps {
  label: string;
  /** Ícone opcional à esquerda do rótulo. */
  icon?: React.ReactNode;
  /** Mensagem de erro. Quando presente, substitui a dica. */
  error?: string;
  /** Texto auxiliar exibido quando não há erro. */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Substitui a classe padrão do rótulo. */
  labelClassName?: string;
}

export function FormField({
  label,
  icon,
  error,
  hint,
  children,
  className,
  labelClassName,
}: FormFieldProps) {
  const labelClass = labelClassName ?? FIELD_LABEL;
  return (
    <div className={cn("space-y-2", className)}>
      <label className={icon ? `${labelClass} flex items-center gap-1` : labelClass}>
        {icon}
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-error font-medium mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-outline font-medium">{hint}</p>
      ) : null}
    </div>
  );
}
