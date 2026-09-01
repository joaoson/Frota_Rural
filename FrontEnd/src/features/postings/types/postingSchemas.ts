import { z } from "zod";

/**
 * O backend devolve TRÊS formatos diferentes para o mesmo recurso, e nenhum é
 * subconjunto do outro:
 *
 *  - lista  → tem `machinery` e `primary_photo_url`, não tem lat/lng
 *  - detalhe → tem `photos[]` e lat/lng, **não tem `machinery`**
 *  - escrita (POST/PUT/PATCH) → formato plano, com `created_at`/`updated_at`
 *
 * Por isso a resposta de um PATCH não pode ser lida com o schema de detalhe.
 */

/** Decimais chegam como string: o DRF serializa Decimal assim por padrão. */
const decimalString = z.string();

export const postingListItemApiSchema = z.object({
  id: z.string(),
  machinery: z.string(),
  machine_brand: z.string().nullish(),
  machine_model: z.string().nullish(),
  machine_usage_purpose: z.string().nullish(),
  machine_year: z.number().nullish(),
  hourly_rate: decimalString,
  location_address: z.string().nullish(),
  availability_start: z.string().nullish(),
  availability_end: z.string().nullish(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  primary_photo_url: z.string().nullish(),
});
export type PostingListItemApi = z.infer<typeof postingListItemApiSchema>;
export const postingListApiSchema = z.array(postingListItemApiSchema);

/** `is_primary` é nullable: a coluna aceita null, apesar do schema OpenAPI dizer o contrário. */
export const postingPhotoApiSchema = z.object({
  url: z.string(),
  is_primary: z.boolean().nullish(),
});

export const postingDetailApiSchema = z.object({
  id: z.string(),
  hourly_rate: decimalString,
  location_address: z.string().nullish(),
  location_lat: decimalString.nullish(),
  location_lng: decimalString.nullish(),
  availability_start: z.string().nullish(),
  availability_end: z.string().nullish(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  machine_brand: z.string().nullish(),
  machine_model: z.string().nullish(),
  machine_year: z.number().nullish(),
  machine_usage_purpose: z.string().nullish(),
  machine_technical_specifications: z.string().nullish(),
  machine_renagro_number: z.string().nullish(),
  photos: z.array(postingPhotoApiSchema).default([]),
});
export type PostingDetailApi = z.infer<typeof postingDetailApiSchema>;

export const postingWriteApiSchema = z.object({
  id: z.string(),
  machinery: z.string(),
  hourly_rate: decimalString,
  location_lat: decimalString.nullish(),
  location_lng: decimalString.nullish(),
  location_address: z.string().nullish(),
  availability_start: z.string().nullish(),
  availability_end: z.string().nullish(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type PostingWriteApi = z.infer<typeof postingWriteApiSchema>;

/** Resposta do upload de foto — note `image_url`, não `url` como no detalhe. */
export const postingPhotoUploadApiSchema = z.object({
  id: z.string(),
  image_url: z.string(),
  is_primary: z.boolean(),
});

export const postingFormSchema = z
  .object({
    machinery: z.string().min(1, "Selecione o equipamento."),
    hourlyRate: z
      .string()
      .trim()
      .min(1, "Valor por hora é obrigatório.")
      .refine((value) => Number(value) > 0, "Informe um valor maior que zero."),
    cep: z.string().trim(),
    locationAddress: z.string().trim().min(1, "Endereço é obrigatório."),
    availabilityStart: z.string().trim(),
    availabilityEnd: z.string().trim(),
    description: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (
      values.availabilityStart &&
      values.availabilityEnd &&
      values.availabilityEnd < values.availabilityStart
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A data final deve ser posterior à inicial.",
        path: ["availabilityEnd"],
      });
    }
  });
export type PostingFormValues = z.infer<typeof postingFormSchema>;

/**
 * Edição de anúncio. Não inclui `machinery` — trocar o equipamento de um anúncio
 * publicado não é uma operação oferecida pela tela — e inclui `status`, que só
 * existe na edição.
 */
export const postingEditFormSchema = z
  .object({
    status: z.string().min(1, "Selecione o status."),
    hourlyRate: z
      .string()
      .trim()
      .min(1, "Valor por hora é obrigatório.")
      .refine((value) => Number(value) > 0, "Informe um valor maior que zero."),
    cep: z.string().trim(),
    locationAddress: z.string().trim().min(1, "Localização é obrigatória."),
    availabilityStart: z.string().trim(),
    availabilityEnd: z.string().trim(),
    description: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (
      values.availabilityStart &&
      values.availabilityEnd &&
      values.availabilityEnd < values.availabilityStart
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A data final deve ser posterior à inicial.",
        path: ["availabilityEnd"],
      });
    }
  });
export type PostingEditFormValues = z.infer<typeof postingEditFormSchema>;

export interface PostingWritePayload {
  machinery?: string;
  hourly_rate?: string;
  location_address?: string;
  availability_start?: string | null;
  availability_end?: string | null;
  description?: string;
  status?: string;
}
