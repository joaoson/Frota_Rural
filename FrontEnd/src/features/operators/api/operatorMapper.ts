import { clearSpecialChars } from "@/shared/utils/clearSpecialChars";

import type { Operator } from "../types/operator";
import type { OperatorApi, OperatorFormValues } from "../types/operatorSchemas";

export function toDomain(dto: OperatorApi): Operator {
  return {
    id: dto.id,
    name: dto.name,
    document: dto.document,
    email: dto.email,
    phone: dto.phone ?? null,
    address: dto.address,
    city: dto.city ?? null,
    state: dto.state ?? null,
    cep: dto.cep ?? null,
    birthDate: dto.birth_date,
    status: dto.status ?? null,
  };
}

export interface OperatorPayload {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  password?: string;
}

// `role` e `employer` não vão no corpo: o servidor os fixa a partir do token.
export function toPayload(values: OperatorFormValues): OperatorPayload {
  return {
    name: values.name,
    birth_date: values.birthDate,
    document: clearSpecialChars(values.document),
    email: values.email.toLowerCase(),
    phone: `+55${clearSpecialChars(values.phone)}`,
    address: values.address,
    city: values.city,
    state: values.state,
    cep: clearSpecialChars(values.cep),
    ...(values.password ? { password: values.password } : {}),
  };
}
