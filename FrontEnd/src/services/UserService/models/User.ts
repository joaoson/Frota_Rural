export type UserStatus = "active" | "warned" | "suspended" | "banned";

export interface User {
  id: string;
  name: string;
  document: string;
  email: string;
  phone?: string | null;
  role: string;
  address: string;
  /** Município e UF do cadastro. O contrato usa este par como foro. */
  city?: string | null;
  state?: string | null;
  birth_date: string;
  status: UserStatus | string;
  created_at?: string;
  updated_at?: string;
  cep?: string | null;
}
