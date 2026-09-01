import { brandLabel, OTHER_BRAND } from "../types/brands";
import type { Machine } from "../types/machine";
import type {
  CreateMachinePayload,
  MachineApi,
  MachineFormValues,
} from "../types/machineSchemas";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * DTO da API → entidade de domínio.
 *
 * É aqui que o `snake_case` termina. Nada acima desta função vê
 * `renagro_number` ou `usage_purpose`.
 */
export function toDomain(dto: MachineApi): Machine {
  return {
    id: dto.id,
    ownerId: dto.owner,
    renagroNumber: dto.renagro_number ?? null,
    brand: dto.brand ?? null,
    model: dto.model ?? null,
    year: dto.year ?? null,
    technicalSpecifications: dto.technical_specifications ?? null,
    usagePurpose: dto.usage_purpose ?? null,
    status: dto.status ?? null,
    createdAt: toDate(dto.created_at),
    updatedAt: toDate(dto.updated_at),
  };
}

/**
 * Valores do formulário → corpo da API.
 *
 * `initialHorimeter` é coletado pelo formulário mas NÃO entra no payload: o
 * model `Machines` não tem esse campo (horímetro pertence a `Rentals`). O
 * comportamento é idêntico ao da versão anterior da página, que também o
 * validava e descartava — mantido de propósito, registrado como pendência.
 */
export function toCreatePayload(
  values: MachineFormValues,
  ownerId: string,
): CreateMachinePayload {
  const brand =
    values.brandKey === OTHER_BRAND ? values.otherBrand : brandLabel(values.brandKey);

  return {
    owner: ownerId,
    renagro_number: values.renagroNumber.toUpperCase(),
    brand,
    model: values.model,
    year: values.year ? Number(values.year) : undefined,
    technical_specifications: values.technicalSpecifications,
    usage_purpose: values.usagePurpose,
  };
}
