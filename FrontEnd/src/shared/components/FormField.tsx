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
