import type { UseFormRegisterReturn } from "react-hook-form";

export function masked<T extends string>(
  registration: UseFormRegisterReturn<T>,
  mask: (value: string) => string,
): UseFormRegisterReturn<T> {
  return {
    ...registration,
    onChange: (event: { target: { value?: string } }) => {
      if (typeof event.target?.value === "string") {
        event.target.value = mask(event.target.value);
      }
      return registration.onChange(event);
    },
  };
}
