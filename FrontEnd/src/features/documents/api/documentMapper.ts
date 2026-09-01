import { clearSpecialChars } from "@/shared/utils/clearSpecialChars";

import { BirthPlace, type Certification, type CnhValidationResult, type OperatorLicense } from "../types/document";
import type {
  CertificationApi,
  CertificationFormValues,
  CnhFormValues,
  CnhValidationApi,
  OperatorLicenseApi,
} from "../types/documentSchemas";

export function licenseToDomain(dto: OperatorLicenseApi): OperatorLicense {
  return {
    id: dto.id,
    userId: dto.user,
    validationStatus: dto.validation_status,
    reviewNote: dto.review_note ?? null,
    createdAt: dto.created_at ?? null,
    name: dto.name,
    birthDate: dto.birth_date,
    cpf: dto.cpf,
    rg: dto.rg,
    motherName: dto.mother_name,
    fatherName: dto.father_name ?? null,
    nationality: dto.nationality,
    birthPlace: BirthPlace.parse(dto.birth_place),
    cnhNumber: dto.cnh_number,
    category: dto.category,
    firstLicenseDate: dto.first_license_date,
    issueDate: dto.issue_date,
    expirationDate: dto.expiration_date,
    issuingState: dto.issuing_state,
    issuingAuthority: dto.issuing_authority,
    situation: dto.situation,
    acc: dto.acc,
    ear: dto.ear,
    medicalRestrictions: dto.medical_restrictions ?? null,
    observations: dto.observations ?? null,
    points: dto.points,
    fileUrl: dto.file_url ?? null,
  };
}

export function certificationToDomain(dto: CertificationApi): Certification {
  return {
    id: dto.id,
    userId: dto.user,
    validationStatus: dto.validation_status,
    reviewNote: dto.review_note ?? null,
    createdAt: dto.created_at ?? null,
    issuingOrganization: dto.issuing_organization,
    title: dto.title,
    issueDate: dto.issue_date,
    expirationDate: dto.expiration_date ?? null,
    credentialCode: dto.credential_code ?? null,
    description: dto.description,
    mediaUrl: dto.media_url ?? null,
  };
}

export function validationToDomain(dto: CnhValidationApi): CnhValidationResult {
  return {
    isValid: dto.is_valid,
    confidence: dto.confidence,
    score: dto.score,
    error: dto.error ?? null,
  };
}

export function licenseToPayload(
  values: CnhFormValues,
  userId: string,
  fileUrl?: string,
): Record<string, unknown> {
  return {
    user: userId,
    name: values.name,
    birth_date: values.birthDate,
    cpf: clearSpecialChars(values.cpf),
    rg: clearSpecialChars(values.rg),
    mother_name: values.motherName,
    father_name: values.fatherName || null,
    nationality: values.nationality,
    birth_place: new BirthPlace(values.birthCity, values.birthState).toString(),
    cnh_number: clearSpecialChars(values.cnhNumber),
    category: values.category,
    first_license_date: values.firstLicenseDate,
    issue_date: values.issueDate,
    expiration_date: values.expirationDate,
    issuing_state: values.issuingState,
    issuing_authority: values.issuingAuthority,
    situation: values.situation,
    acc: values.acc,
    ear: values.ear,
    medical_restrictions: values.medicalRestrictions || null,
    observations: values.observations || null,
    points: values.points ? Number(values.points) : 0,
    file_url: fileUrl,
  };
}

export function certificationToPayload(
  values: CertificationFormValues,
  userId: string,
  mediaUrl?: string,
): Record<string, unknown> {
  return {
    user: userId,
    issuing_organization: values.issuingOrganization,
    title: values.title,
    issue_date: values.issueDate,
    expiration_date: values.expirationDate || null,
    credential_code: values.credentialCode || null,
    description: values.description,
    media_url: mediaUrl,
  };
}

/** Entidade → valores de formulário, para a tela de edição. */
export function licenseToFormValues(license: OperatorLicense): CnhFormValues {
  return {
    name: license.name,
    birthDate: license.birthDate,
    cpf: license.cpf,
    rg: license.rg,
    motherName: license.motherName,
    fatherName: license.fatherName ?? "",
    nationality: license.nationality,
    birthCity: license.birthPlace.city,
    birthState: license.birthPlace.state,
    cnhNumber: license.cnhNumber,
    category: license.category,
    firstLicenseDate: license.firstLicenseDate,
    issueDate: license.issueDate,
    expirationDate: license.expirationDate,
    issuingState: license.issuingState,
    issuingAuthority: license.issuingAuthority,
    situation: license.situation,
    acc: license.acc,
    ear: license.ear,
    medicalRestrictions: license.medicalRestrictions ?? "",
    observations: license.observations ?? "",
    points: String(license.points),
  };
}

export function certificationToFormValues(
  certification: Certification,
): CertificationFormValues {
  return {
    issuingOrganization: certification.issuingOrganization,
    title: certification.title,
    issueDate: certification.issueDate,
    expirationDate: certification.expirationDate ?? "",
    credentialCode: certification.credentialCode ?? "",
    description: certification.description,
  };
}
