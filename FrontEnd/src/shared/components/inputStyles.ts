/**
 * Classes dos campos de formulário.
 *
 * Vivem fora de `FormField.tsx` porque um módulo que exporta componente e
 * constante ao mesmo tempo quebra o Fast Refresh — é o que a regra
 * `react-refresh/only-export-components` acusa.
 *
 * Estas strings substituem as **sete cópias byte a byte** de `INPUT_BASE` +
 * `inputClass()` que existiam espalhadas pelas páginas.
 */
export const INPUT_BASE =
  "w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow";

/** Classe do input conforme o estado de erro. */
export function inputClass(hasError: boolean, extra = ""): string {
  return `${INPUT_BASE}${extra ? ` ${extra}` : ""} ${
    hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
  }`;
}

export const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-widest text-outline";
