/**
 * Mensagem de erro do CEP, ou "" quando ele está válido.
 *
 * Regra única para todos os formulários: o CEP tem 8 dígitos. O que varia de
 * uma tela para outra é apenas se preenchê-lo é obrigatório — no cadastro de
 * usuário é, no anúncio não é.
 *
 * @param obrigatorio quando falso, um campo vazio é aceito; preenchido pela
 *   metade continua sendo erro, porque a API recusa o registro inteiro.
 */
export function mensagemErroCEP(value: string, obrigatorio = false): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return obrigatorio ? "CEP é obrigatório." : "";
  if (digits.length !== 8) return "CEP deve ter exatamente 8 dígitos.";
  return "";
}
