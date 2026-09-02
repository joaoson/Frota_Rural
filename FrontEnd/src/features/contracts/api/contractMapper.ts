import type { Contract, Rental } from "../types/rental";
import type { ContractApi, RentalApi } from "../types/rentalSchemas";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function rentalToDomain(dto: RentalApi): Rental {
  return {
    id: dto.id,
    postingId: dto.postings,
    lesseeId: dto.lessee,
    operatorId: dto.operator ?? null,
    lessorName: dto.lessor_name ?? null,
    lesseeName: dto.lessee_name ?? null,
    machineBrand: dto.machine_brand ?? null,
    machineModel: dto.machine_model ?? null,
    contractNumber: dto.contract_number ?? null,
    startDate: toDate(dto.start_date),
    endDate: toDate(dto.end_date),
    totalPrice: toNumber(dto.total_price),
    initialHourMeter: dto.initial_hour_meter ?? null,
    finalHourMeter: dto.final_hour_meter ?? null,
    status: dto.status ?? null,
  };
}

export function contractToDomain(dto: ContractApi): Contract {
  return {
    id: dto.id,
    rentalId: dto.rental,
    documentUrl: dto.document_url ?? null,
    acceptedByLessor: dto.accepted_by_lessor ?? null,
    acceptedByLessee: dto.accepted_by_lessee ?? null,
    status: dto.status ?? null,
    rental: dto.rental_details ? rentalToDomain(dto.rental_details) : null,
  };
}

export function toRentalDateTime(date: string, time: "start" | "end"): string {
  return `${date}T${time === "start" ? "08:00:00" : "18:00:00"}Z`;
}
