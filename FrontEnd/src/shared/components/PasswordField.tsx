import { useId, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";

import { FormField } from "./FormField";
import { inputClass } from "./inputStyles";

interface PasswordFieldProps extends React.ComponentProps<"input"> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  inputClassName?: string;
  labelClassName?: string;
}

export function PasswordField({
  label,
  error,
  hint,
  inputClassName,
  labelClassName,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;

  return (
    <FormField label={label} error={error} hint={hint} labelClassName={labelClassName} htmlFor={id}>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          aria-invalid={error ? true : undefined}
          type={visible ? "text" : "password"}
          className={inputClassName ?? inputClass(Boolean(error), "pr-12")}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
        >
          <MaterialIcon icon={visible ? "visibility_off" : "visibility"} size={20} />
        </button>
      </div>
    </FormField>
  );
}
