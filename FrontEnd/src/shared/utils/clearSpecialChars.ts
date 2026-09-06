export function clearSpecialChars(value: string) {
  return value.replace(/\D/g, "");
}
