export function validateCPF(digits: string): boolean {
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calc = (len: number) => {
    const sum = digits
      .slice(0, len)
      .split("")
      .reduce((acc, d, i) => acc + Number(d) * (len + 1 - i), 0);
    const rem = (sum * 10) % 11;
    return rem >= 10 ? 0 : rem;
  };

  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}
