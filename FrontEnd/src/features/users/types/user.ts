export interface User {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  role: string;
  address: string;
  /** Município e UF do cadastro. O contrato usa este par como foro. */
  city: string | null;
  state: string | null;
  cep: string | null;
  birthDate: string;
  status: string | null;
  createdAt: Date | null;
}

export function isBlocked(user: User): boolean {
  return user.status === "suspended" || user.status === "banned";
}
