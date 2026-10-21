import { z } from "zod";
import { refundSchema } from "./management";

const meterReadingApiSchema = z.object({
  id: z.string(), value: z.number(), note: z.string().nullish(), recorded_at: z.string(), recorded_by: z.string().nullish(),
});
export const rentalMeterApiSchema = z.object({
  check_in: meterReadingApiSchema.nullable(),
  check_out: meterReadingApiSchema.nullable(),
  hours_used: z.number().nullable(),
  reference_hours: z.number().nullable(),
});

export const rentalApiSchema = z.object({
  id: z.string(),
  postings: z.string(),
  lessee: z.string(),
  lessor_id: z.string().nullish(),
  operator: z.string().nullish(),
  recurrence: z.string().nullish(),
  reservation_expires_at: z.string().nullish(),
  recurrence_index: z.number().int().positive().nullish(),
  start_date: z.string(),
  end_date: z.string(),
  total_price: z.string().nullish(),
  daily_rate: z.string().nullish(),
  billable_days: z.number().int().nullish(),
  subtotal: z.string().nullish(),
  platform_fee: z.string().nullish(),
  initial_hour_meter: z.number().nullish(),
  final_hour_meter: z.number().nullish(),
  status: z.string().nullish(),
  phase: z.string().nullish(),
  phase_label: z.string().nullish(),
  allowed_actions: z.array(z.string()).nullish(),
  notes: z.string().nullish(),
  meter: rentalMeterApiSchema.nullish(),
  // Estado do aceite: `status` sozinho não distingue quem já assinou.
  accepted_by_lessor: z.boolean().nullish(),
  accepted_by_lessee: z.boolean().nullish(),
  contract_status: z.string().nullish(),
  contract_id: z.string().nullish(),
  signature_deadline: z.string().nullish(),
  refunds: z.array(refundSchema).optional(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  lessee_name: z.string().nullish(),
  lessor_name: z.string().nullish(),
  machine_brand: z.string().nullish(),
  machine_model: z.string().nullish(),
  contract_number: z.string().nullish(),
});
export type RentalApi = z.infer<typeof rentalApiSchema>;
export const rentalListApiSchema = z.array(rentalApiSchema);
export const rentalQuoteApiSchema = z.object({
  tarifa_hora: z.string(),
  horas_por_diaria: z.number().int(),
  valor_diaria: z.string(),
  diarias: z.number().int(),
  subtotal: z.string(),
  taxa_percentual: z.string(),
  taxa_valor: z.string(),
  total: z.string(),
});
export type RentalQuoteApi = z.infer<typeof rentalQuoteApiSchema>;
export const rentalOccupancyApiSchema = z.object({
  ocupados: z.array(z.object({
    id: z.string(), start_date: z.iso.datetime({ offset: true }),
    end_date: z.iso.datetime({ offset: true }), status: z.string(),
  })),
});

export const contractApiSchema = z.object({
  id: z.string(),
  rental: z.string(),
  document_url: z.string().nullish(),
  accepted_by_lessor: z.boolean().nullish(),
  accepted_by_lessee: z.boolean().nullish(),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  rental_details: rentalApiSchema.nullish(),
});
export type ContractApi = z.infer<typeof contractApiSchema>;

export interface CreateRentalPayload {
  postings: string;
  lessee: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: string;
  /** Observações para a retirada; vão ao locador, não ao contrato. */
  notes?: string;
}

export type SignatureRole = "locador" | "locatario";

export const signatureEvidenceApiSchema = z.object({
  id: z.string(),
  contract: z.string(),
  role: z.enum(["locador", "locatario"]),
  signer: z.string().nullish(),
  signer_name: z.string(),
  signer_email: z.string(),
  document_version: z.string(),
  document_hash: z.string(),
  hash_algorithm: z.string(),
  signed_at: z.string(),
  ip_address: z.string(),
  user_agent: z.string(),
  otp_verified: z.boolean(),
  previous_hash: z.string(),
  record_hash: z.string(),
});

export const contractEvidenceApiSchema = z.object({
  contrato_id: z.string(),
  aluguel_id: z.string(),
  status: z.string(),
  documento: z.object({ versao: z.string(), hash: z.string(), algoritmo: z.string() }),
  // false quando algum registro foi alterado ou o encadeamento não fecha
  cadeia_integra: z.boolean(),
  inconsistencias: z.array(z.string()),
  assinaturas: z.array(signatureEvidenceApiSchema),
  fundamento_legal: z.string(),
});

export const signatureOtpApiSchema = z.object({
  sent_to: z.string(),
  expires_in_seconds: z.number(),
});

export type SignatureEvidenceApi = z.infer<typeof signatureEvidenceApiSchema>;
export type ContractEvidenceApi = z.infer<typeof contractEvidenceApiSchema>;
export type SignatureOtpApi = z.infer<typeof signatureOtpApiSchema>;
