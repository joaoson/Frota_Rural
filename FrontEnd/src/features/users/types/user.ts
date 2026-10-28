export interface User {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  role: string;
  address: string;
  /** Município e UF do cadastro. O contrato usa este par como foro. */
  city: string | null;
  state: string | null;
  cep: string | null;
  birthDate: string;
  status: string | null;
  createdAt: Date | null;
  portePropriedadeId: string | null;
  portePropriedadeNome: string | null;
}

export interface PortePropriedade {
  id: string;
  nome: string;
}

export function isBlocked(user: User): boolean {
  return user.status === "suspended" || user.status === "banned";
}
