import { clearSpecialChars } from "@/shared/utils/clearSpecialChars";

import type { User } from "../types/user";
import type { SignupFormValues, UserApi } from "../types/userSchemas";

export function toDomain(dto: UserApi): User {
  return {
    id: dto.id,
    name: dto.name,
    document: dto.document,
    email: dto.email,
    phone: dto.phone ?? null,
    role: dto.role,
    address: dto.address,
    city: dto.city ?? null,
    state: dto.state ?? null,
    cep: dto.cep ?? null,
    birthDate: dto.birth_date,
    status: dto.status ?? null,
    createdAt: dto.created_at ? new Date(dto.created_at) : null,
  };
}

export interface CreateUserPayload {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  role: string;
  address: string;
  // O contrato usa o par município/UF como foro.
  city: string;
  state: string;
  cep: string;
  password: string;
}

export function toCreatePayload(values: SignupFormValues): CreateUserPayload {
  return {
    name: values.name,
    birth_date: values.birthDate,
    document: clearSpecialChars(values.document),
    email: values.email.toLowerCase(),
    phone: `+55${clearSpecialChars(values.phone)}`,
    role: values.role,
    address: values.address,
    city: values.city,
    state: values.state,
    cep: clearSpecialChars(values.cep),
    password: values.password,
  };
}
