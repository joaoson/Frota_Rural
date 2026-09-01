export interface PostingPhoto {
  url: string;
  isPrimary: boolean;
}

/** Item de lista. Traz o id da máquina, mas poucos dados dela. */
export interface PostingListItem {
  id: string;
  machineryId: string;
  machineBrand: string | null;
  machineModel: string | null;
  machineUsagePurpose: string | null;
  machineYear: number | null;
  hourlyRate: number;
  locationAddress: string | null;
  availabilityStart: Date | null;
  availabilityEnd: Date | null;
  description: string | null;
  status: string | null;
  primaryPhotoUrl: string | null;
}

/** Detalhe. Traz todas as fotos e a máquina expandida, mas **não** o id dela. */
export interface PostingDetail {
  id: string;
  hourlyRate: number;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  availabilityStart: Date | null;
  availabilityEnd: Date | null;
  description: string | null;
  status: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  machineYear: number | null;
  machineUsagePurpose: string | null;
  machineTechnicalSpecifications: string | null;
  machineRenagroNumber: string | null;
  photos: PostingPhoto[];
}

export function postingMachineName(
  posting: Pick<PostingListItem, "machineBrand" | "machineModel">,
): string {
  const parts = [posting.machineBrand, posting.machineModel].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "Equipamento";
}

export function isPostingActive(status: string | null): boolean {
  return status === "active";
}
