import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { HttpError } from "./errors";

/**
 * Pendura as mensagens de campo devolvidas pelo backend nos campos do formulário.
 *
 * Aceita qualquer `HttpError`, não só o 400 de validação: o 409 de cadastro
 * simultâneo (e-mail ou documento que outra requisição gravou primeiro) também
 * traz o campo em conflito.
 *
 * Devolve `true` quando ao menos uma mensagem foi colocada em um campo — quem
 * chama usa isso para decidir entre confiar no formulário ou mostrar um toast.
 */
export function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  apiFieldToForm: Partial<Record<string, Path<T>>>,
): boolean {
  if (!(error instanceof HttpError)) return false;

  let placed = false;
  for (const [apiField, messages] of Object.entries(error.fieldErrors)) {
    const formField = apiFieldToForm[apiField];
    const message = messages[0];
    if (formField && message) {
      form.setError(formField, { type: "server", message });
      placed = true;
    }
  }
  return placed;
}
