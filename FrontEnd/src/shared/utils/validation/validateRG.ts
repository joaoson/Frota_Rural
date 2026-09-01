export function validateRG(digits: string): boolean {
  if (/^(\d)\1{8}$/.test(digits)) return false;
  return digits.length >= 7 && digits.length <= 9;
}
