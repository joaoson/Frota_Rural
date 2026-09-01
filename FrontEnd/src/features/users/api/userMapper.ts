import { clearSpecialChars } from "@/utils/clearSpecialChars";

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
  cep: string;
  password: string;
}

/**
 * `city` e `state` são coletados pelo formulário mas NÃO entram no payload: a
 * tabela `users` não tem essas colunas — o DRF os descartava silenciosamente.
 * Continuam na UI porque alimentam a busca por CEP e a conferência do endereço.
 */
export function toCreatePayload(values: SignupFormValues): CreateUserPayload {
  return {
    name: values.name,
    birth_date: values.birthDate,
    document: clearSpecialChars(values.document),
    email: values.email.toLowerCase(),
    phone: `+55${clearSpecialChars(values.phone)}`,
    role: values.role,
    address: values.address,
    cep: clearSpecialChars(values.cep),
    password: values.password,
  };
}
