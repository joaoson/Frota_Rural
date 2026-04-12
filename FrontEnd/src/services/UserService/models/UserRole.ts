export const UserRole = {
  Locador: "locador",
  Locatario: "locatario",
  Operador: "operador",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
