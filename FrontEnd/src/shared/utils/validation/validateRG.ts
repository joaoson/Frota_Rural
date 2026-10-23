const MIN_LENGTH = 7;
const MAX_LENGTH = 9;

/**
 * `value` já limpo (`cleanRG`): 7 a 9 caracteres, só dígitos ou dígitos com `X` no fim.
 * Não há um tamanho oficial único: o RG varia por estado e por época (7 a 9 caracteres,
 * com ou sem dígito verificador), então só barramos o que nenhum RG tem.
 */
export function validateRG(value: string): boolean {
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return false;
  if (!/^\d+X?$/.test(value)) return false;
  return !/^(\d)\1*X?$/.test(value); // 111111111, 777777777X...
}
