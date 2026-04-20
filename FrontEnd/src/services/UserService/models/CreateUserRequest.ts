import type { UserRole } from "./UserRole";

export type CreateUserRequest = {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  role: UserRole;
  address: string;
  city: string;
  state: string;
  cep: string;
  password: string;
};
