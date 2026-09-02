import type { PostingDetail, PostingListItem, PostingPhoto } from "../types/posting";
import type {
  PostingDetailApi,
  PostingEditFormValues,
  PostingFormValues,
  PostingListItemApi,
  PostingWritePayload,
} from "../types/postingSchemas";

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

export function listItemToDomain(dto: PostingListItemApi): PostingListItem {
  return {
    id: dto.id,
    machineryId: dto.machinery,
    machineBrand: dto.machine_brand ?? null,
    machineModel: dto.machine_model ?? null,
    machineUsagePurpose: dto.machine_usage_purpose ?? null,
    machineYear: dto.machine_year ?? null,
    hourlyRate: toNumber(dto.hourly_rate) ?? 0,
    locationAddress: dto.location_address ?? null,
    availabilityStart: toDate(dto.availability_start),
    availabilityEnd: toDate(dto.availability_end),
    description: dto.description ?? null,
    status: dto.status ?? null,
    primaryPhotoUrl: dto.primary_photo_url ?? null,
  };
}

export function detailToDomain(dto: PostingDetailApi): PostingDetail {
  const photos: PostingPhoto[] = dto.photos.map((photo) => ({
    url: photo.url,
    isPrimary: photo.is_primary ?? false,
  }));

  return {
    id: dto.id,
    hourlyRate: toNumber(dto.hourly_rate) ?? 0,
    locationAddress: dto.location_address ?? null,
    latitude: toNumber(dto.location_lat),
    longitude: toNumber(dto.location_lng),
    availabilityStart: toDate(dto.availability_start),
    availabilityEnd: toDate(dto.availability_end),
    description: dto.description ?? null,
    status: dto.status ?? null,
    machineBrand: dto.machine_brand ?? null,
    machineModel: dto.machine_model ?? null,
    machineYear: dto.machine_year ?? null,
    machineUsagePurpose: dto.machine_usage_purpose ?? null,
    machineTechnicalSpecifications: dto.machine_technical_specifications ?? null,
    machineRenagroNumber: dto.machine_renagro_number ?? null,
    photos,
  };
}

function toDateTime(date: string, time: string): string | null {
  return date ? `${date}T${time}` : null;
}

export function toWritePayload(values: PostingFormValues): PostingWritePayload {
  return {
    machinery: values.machinery,
    hourly_rate: values.hourlyRate,
    location_address: values.locationAddress,
    availability_start: toDateTime(values.availabilityStart, "00:00:00"),
    availability_end: toDateTime(values.availabilityEnd, "23:59:59"),
    description: values.description,
  };
}

export function toEditPayload(values: PostingEditFormValues): PostingWritePayload {
  return {
    status: values.status,
    hourly_rate: values.hourlyRate,
    location_address: values.locationAddress,
    availability_start: toDateTime(values.availabilityStart, "00:00:00"),
    availability_end: toDateTime(values.availabilityEnd, "23:59:59"),
    description: values.description,
  };
}

export function toDateInput(value: Date | null): string {
  return value ? value.toISOString().split("T")[0] : "";
}
