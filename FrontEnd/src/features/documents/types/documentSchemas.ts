import { z } from "zod";

import { validateCPF } from "@/utils/validation/validateCPF";
import { validateRG } from "@/utils/validation/validateRG";

export const ValidationStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;
export type ValidationStatus = (typeof ValidationStatus)[keyof typeof ValidationStatus];

export const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"] as const;
export const CNH_SITUATIONS = [
  "active",
  "expired",
  "suspended",
  "revoked",
  "blocked",
  "ppd",
] as const;

/**
 * `validation_status` chega como string livre na leitura: linhas antigas podem
 * ter qualquer valor. A restrição vale só na escrita.
 */
export const operatorLicenseApiSchema = z.object({
  id: z.string(),
  user: z.string(),
  name: z.string(),
  birth_date: z.string(),
  cpf: z.string(),
  rg: z.string(),
  mother_name: z.string(),
  father_name: z.string().nullish(),
  nationality: z.string(),
  birth_place: z.string(),
  cnh_number: z.string(),
  category: z.string(),
  first_license_date: z.string(),
  issue_date: z.string(),
  expiration_date: z.string(),
  issuing_state: z.string(),
  issuing_authority: z.string(),
  situation: z.string(),
  acc: z.boolean(),
  ear: z.boolean(),
  medical_restrictions: z.string().nullish(),
  observations: z.string().nullish(),
  points: z.number(),
  file_url: z.string().nullish(),
  validation_status: z.string(),
  review_note: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type OperatorLicenseApi = z.infer<typeof operatorLicenseApiSchema>;
export const operatorLicenseListApiSchema = z.array(operatorLicenseApiSchema);

/** Sem `institution`: a coluna não existe no modelo nem no serializer. */
export const certificationApiSchema = z.object({
  id: z.string(),
  user: z.string(),
  issuing_organization: z.string(),
  title: z.string(),
  issue_date: z.string(),
  expiration_date: z.string().nullish(),
  credential_code: z.string().nullish(),
  description: z.string(),
  media_url: z.string().nullish(),
  validation_status: z.string(),
  review_note: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type CertificationApi = z.infer<typeof certificationApiSchema>;
export const certificationListApiSchema = z.array(certificationApiSchema);

/** Resultado do classificador. `error` aparece mesmo em 200, quando o ML degrada. */
export const cnhValidationApiSchema = z.object({
  is_valid: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  score: z.number(),
  error: z.string().optional(),
});
export type CnhValidationApi = z.infer<typeof cnhValidationApiSchema>;

export const uploadResponseSchema = z.object({ url: z.string() });

const requiredText = (label: string) => z.string().trim().min(1, `${label} é obrigatório.`);

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Idade mínima do condutor. */
export function maxDriverBirthDate(): string {
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return limit.toISOString().split("T")[0];
}

export const cnhFormSchema = z
  .object({
    name: requiredText("Nome completo"),
    birthDate: z
      .string()
      .min(1, "Data de nascimento é obrigatória.")
      .refine((value) => value >= "1900-01-01", "Data de nascimento inválida.")
      .refine((value) => value <= maxDriverBirthDate(), "O condutor deve ter pelo menos 18 anos."),
    cpf: z
      .string()
      .trim()
      .min(1, "CPF é obrigatório.")
      .refine(
        (value) => validateCPF(value.replace(/\D/g, "")),
        "CPF inválido. Verifique os dígitos informados.",
      ),
    rg: z
      .string()
      .trim()
      .min(1, "RG é obrigatório.")
      .refine(
        (value) => validateRG(value.replace(/\D/g, "")),
        "RG inválido. Verifique os dígitos informados.",
      )
      .refine(
        (value) => /^\d{2}\.\d{3}\.\d{3}-[\dXx]$/.test(value),
        "O RG deve seguir o formato XX.XXX.XXX-X.",
      ),
    motherName: requiredText("Nome da mãe"),
    fatherName: z.string().trim(),
    nationality: requiredText("Nacionalidade"),
    birthCity: requiredText("Cidade de nascimento"),
    birthState: z.string().min(1, "Estado de nascimento é obrigatório."),
    cnhNumber: z
      .string()
      .trim()
      .min(1, "Número da CNH é obrigatório.")
      .refine(
        (value) => value.replace(/\D/g, "").length === 11,
        "O número da CNH deve conter exatamente 11 dígitos.",
      ),
    category: z
      .string()
      .min(1, "Categoria é obrigatória.")
      .refine((value) => (CNH_CATEGORIES as readonly string[]).includes(value), "Categoria inválida."),
    firstLicenseDate: z
      .string()
      .min(1, "Data da primeira habilitação é obrigatória.")
      .refine(
        (value) => value <= todayIso(),
        "A data da primeira habilitação não pode ser no futuro.",
      ),
    issueDate: z
      .string()
      .min(1, "Data de emissão é obrigatória.")
      .refine((value) => value <= todayIso(), "A data de emissão não pode ser no futuro."),
    expirationDate: z.string().min(1, "Data de validade é obrigatória."),
    issuingState: z.string().min(1, "UF de emissão é obrigatório."),
    issuingAuthority: requiredText("Órgão emissor"),
    situation: z
      .string()
      .min(1, "Situação é obrigatória.")
      .refine((value) => (CNH_SITUATIONS as readonly string[]).includes(value), "Situação inválida."),
    acc: z.boolean(),
    ear: z.boolean(),
    medicalRestrictions: z.string().trim(),
    observations: z.string().trim(),
    // String, como todo campo numérico de `<input>`. A conversão vive no mapper.
    points: z
      .string()
      .trim()
      .refine((value) => {
        if (!value) return true;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 40;
      }, "A pontuação deve ser entre 0 e 40."),
  })
  .superRefine((values, ctx) => {
    // Regra que depende de dois campos: só uma CNH ativa precisa estar no prazo.
    if (values.situation === "active" && values.expirationDate && values.expirationDate < todayIso()) {
      ctx.addIssue({
        code: "custom",
        message: "A data de validade de uma CNH ativa deve ser no futuro.",
        path: ["expirationDate"],
      });
    }
  });
export type CnhFormValues = z.infer<typeof cnhFormSchema>;

export const certificationFormSchema = z
  .object({
    issuingOrganization: z
      .string()
      .trim()
      .min(1, "Organização emissora é obrigatória.")
      .min(2, "A organização emissora deve ter pelo menos 2 caracteres."),
    title: z
      .string()
      .trim()
      .min(1, "Título do curso é obrigatório.")
      .min(3, "O título deve ter pelo menos 3 caracteres."),
    issueDate: z
      .string()
      .min(1, "Data de emissão é obrigatória.")
      .refine(
        (value) => value <= new Date().toISOString().split("T")[0],
        "A data de emissão não pode ser no futuro.",
      ),
    expirationDate: z.string().trim(),
    credentialCode: z.string().trim(),
    // O backend exige `description` não-vazia: é TextField sem blank=True.
    description: z
      .string()
      .trim()
      .min(1, "Descrição é obrigatória.")
      .min(10, "A descrição deve conter pelo menos 10 caracteres."),
  })
  .superRefine((values, ctx) => {
    if (values.expirationDate && values.issueDate && values.expirationDate <= values.issueDate) {
      ctx.addIssue({
        code: "custom",
        message: "A data de validade deve ser posterior à data de emissão.",
        path: ["expirationDate"],
      });
    }
  });
export type CertificationFormValues = z.infer<typeof certificationFormSchema>;

export interface ReviewDocumentPayload {
  validation_status: "approved" | "rejected";
  review_note?: string | null;
}
