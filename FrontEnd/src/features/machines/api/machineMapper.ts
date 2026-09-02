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
