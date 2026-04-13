export type UserStatus = "active" | "warned" | "suspended" | "banned";

export interface User {
  id: string;
  name: string;
  document: string;
  email: string;
  phone?: string | null;
  role: string;
  address: string;
  birth_date: string;
  status: UserStatus | string;
  created_at?: string;
  updated_at?: string;
}
