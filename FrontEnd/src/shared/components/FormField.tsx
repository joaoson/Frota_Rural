import { Children, cloneElement, isValidElement, useId } from "react";

import { cn } from "@/lib/utils";

import { FIELD_LABEL } from "./inputStyles";

interface FormFieldProps {
  label: string;
  icon?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
  /** Quando o controle não é filho direto, o chamador informa o id. */
  htmlFor?: string;
}

export function FormField({
  label,
  icon,
  error,
  hint,
  children,
  className,
  labelClassName,
  htmlFor,
}: FormFieldProps) {
  const generatedId = useId();
  const labelClass = labelClassName ?? FIELD_LABEL;

  // Liga rótulo e controle. Só um elemento de DOM recebe `id` injetado — um
  // componente próprio não é obrigado a repassar a prop adiante.
  const only = Children.toArray(children);
  const control = only.length === 1 ? only[0] : null;
  const isDomControl = isValidElement(control) && typeof control.type === "string";
  const controlProps = isDomControl
    ? (control.props as { id?: string; "aria-invalid"?: boolean })
    : null;
  const controlId = htmlFor ?? controlProps?.id ?? (isDomControl ? generatedId : undefined);

  const body =
    isDomControl && !htmlFor && controlId
      ? cloneElement(control as React.ReactElement<Record<string, unknown>>, {
          id: controlId,
          "aria-invalid": error ? true : undefined,
        })
      : children;

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={controlId}
        className={icon ? `${labelClass} flex items-center gap-1` : labelClass}
      >
        {icon}
        {label}
      </label>
      {body}
      {error ? (
        <p className="text-[11px] text-error font-medium mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-outline font-medium">{hint}</p>
      ) : null}
    </div>
  );
}
