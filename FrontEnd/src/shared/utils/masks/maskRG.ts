/** 7 a 9 caracteres: o RG não tem tamanho único (cada Secretaria de Segurança Pública define o seu). */
export const RG_MAX_LENGTH = 9;

/**
 * Só o que pode estar num RG: dígitos e, como último caractere, o dígito verificador `X`.
 * (Antes o `X` era descartado junto com a pontuação e o RG era salvo errado.)
 */
export function cleanRG(value: string): string {
  const chars = value.toUpperCase().replace(/[^0-9X]/g, "");
  const x = chars.indexOf("X");
  if (x === 0) return "";
  const body = x === -1 ? chars : chars.slice(0, x + 1);
  return body.slice(0, RG_MAX_LENGTH);
}

/**
 * Máscara que acompanha o tamanho do RG:
 * - 9 caracteres: `00.000.000-0` (8 dígitos + verificador);
 * - 8 caracteres: `0.000.000-0` (RG mais antigo, 7 dígitos + verificador);
 * - 7 caracteres: `0.000.000` (sem verificador);
 * - menos que isso: vai pontuando enquanto se digita.
 */
export function maskRG(value: string): string {
  const chars = cleanRG(value);
  if (chars.length === 7 || chars.length === 8) {
    const dv = chars.slice(7);
    return `${chars.slice(0, 1)}.${chars.slice(1, 4)}.${chars.slice(4, 7)}${dv ? `-${dv}` : ""}`;
  }
  const body = [chars.slice(0, 2), chars.slice(2, 5), chars.slice(5, 8)].filter(Boolean).join(".");
  return chars.length > 8 ? `${body}-${chars.slice(8)}` : body;
}
