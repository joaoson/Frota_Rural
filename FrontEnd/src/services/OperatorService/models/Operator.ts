import type { UserStatus } from "@/services/UserService/models/User";

/** Operador vinculado à equipe do usuário autenticado. */
export interface Operator {
  id: string;
  name: string;
  document: string;
  email: string;
  phone?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  birth_date: string;
  status: UserStatus | string;
  created_at?: string;
  updated_at?: string;
}
