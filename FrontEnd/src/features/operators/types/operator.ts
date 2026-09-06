/** Operador vinculado à equipe do usuário autenticado. */
export interface Operator {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  cep: string | null;
  birthDate: string;
  status: string | null;
}
