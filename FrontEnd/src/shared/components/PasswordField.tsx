import { useState } from "react";

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

  return (
    <FormField label={label} error={error} hint={hint} labelClassName={labelClassName}>
      <div className="relative">
        <input
          {...inputProps}
          type={visible ? "text" : "password"}
          className={inputClassName ?? inputClass(Boolean(error), "pr-12")}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1"
        >
          <MaterialIcon icon={visible ? "visibility_off" : "visibility"} size={20} />
        </button>
      </div>
    </FormField>
  );
}
