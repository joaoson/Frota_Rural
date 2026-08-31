import { validateCPF } from "./validateCPF";
import { validateCNPJ } from "./validateCNPJ";

/**
 * Valida CPF ou CNPJ a partir do valor digitado (com ou sem máscara).
 *
 * Fonte única da regra: antes esta função estava copiada em `Signup`,
 * `DashboardLocador` e `DashboardLocatario`, e as três cópias podiam divergir
 * do que a API aceita.
 */
export function validateDocument(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return validateCPF(digits);
  if (digits.length === 14) return validateCNPJ(digits);
  return false;
}

/**
 * Mensagem de erro do documento, ou "" quando ele está válido.
 *
 * @param obrigatorio quando falso, um campo vazio é aceito.
 */
export function mensagemErroDocumento(value: string, obrigatorio = true): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return obrigatorio ? "Documento é obrigatório." : "";
  if (digits.length !== 11 && digits.length !== 14) {
    return "Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos).";
  }
  if (!validateDocument(value)) {
    return digits.length === 14
      ? "CNPJ inválido. Verifique os dígitos informados."
      : "CPF inválido. Verifique os dígitos informados.";
  }
  return "";
}
