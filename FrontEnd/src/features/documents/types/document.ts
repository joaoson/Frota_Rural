import type { ValidationStatus } from "./documentSchemas";

/** Naturalidade: o backend guarda "Cidade – UF" em um campo só. */
export class BirthPlace {
  static readonly SEPARATOR = " – ";
  readonly city: string;
  readonly state: string;

  constructor(city: string, state: string) {
    this.city = city;
    this.state = state;
  }

  static parse(raw: string): BirthPlace {
    const parts = raw.split(BirthPlace.SEPARATOR);
    return parts.length === 2
      ? new BirthPlace(parts[0].trim(), parts[1].trim())
      : new BirthPlace(raw.trim(), "");
  }

  toString(): string {
    return this.state ? `${this.city}${BirthPlace.SEPARATOR}${this.state}` : this.city;
  }
}

interface ReviewableDocument {
  id: string;
  userId: string;
  validationStatus: string;
  reviewNote: string | null;
  createdAt: string | null;
}

export interface OperatorLicense extends ReviewableDocument {
  name: string;
  birthDate: string;
  cpf: string;
  rg: string;
  motherName: string;
  fatherName: string | null;
  nationality: string;
  birthPlace: BirthPlace;
  cnhNumber: string;
  category: string;
  firstLicenseDate: string;
  issueDate: string;
  expirationDate: string;
  issuingState: string;
  issuingAuthority: string;
  situation: string;
  acc: boolean;
  ear: boolean;
  medicalRestrictions: string | null;
  observations: string | null;
  points: number;
  fileUrl: string | null;
}

export interface Certification extends ReviewableDocument {
  issuingOrganization: string;
  title: string;
  issueDate: string;
  expirationDate: string | null;
  credentialCode: string | null;
  description: string;
  mediaUrl: string | null;
}

export interface CnhValidationResult {
  isValid: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
  error: string | null;
}

export function isApproved(document: ReviewableDocument): boolean {
  return document.validationStatus === "approved";
}

export function isPending(document: ReviewableDocument): boolean {
  return document.validationStatus === "pending";
}

/** Regra de negócio: esta CNH habilita a operar? */
export function enablesOperation(license: OperatorLicense, today: Date = new Date()): boolean {
  const notExpired = new Date(license.expirationDate) >= today;
  const situationOk = !["suspended", "revoked", "blocked"].includes(license.situation);
  return isApproved(license) && notExpired && situationOk && license.points < 20;
}

export function statusLabel(status: string | ValidationStatus): string {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  return "Pendente";
}
