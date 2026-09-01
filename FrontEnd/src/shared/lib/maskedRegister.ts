import type { UseFormRegisterReturn } from "react-hook-form";

/**
 * Aplica uma máscara a um campo do react-hook-form sem torná-lo controlado.
 *
 * Reescreve o valor do input antes de repassar o evento ao RHF, então o
 * formulário continua uncontrolled e a máscara age no caminho.
 *
 * A assinatura do parâmetro segue o `ChangeHandler` do próprio RHF, que é mais
 * frouxa que `ChangeEvent` — ele só precisa de `target`.
 */
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
