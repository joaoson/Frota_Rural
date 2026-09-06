import { z } from "zod";

export const rentalApiSchema = z.object({
  id: z.string(),
  postings: z.string(),
  lessee: z.string(),
  operator: z.string().nullish(),
  start_date: z.string(),
  end_date: z.string(),
  total_price: z.string().nullish(),
  initial_hour_meter: z.number().nullish(),
  final_hour_meter: z.number().nullish(),
  status: z.string().nullish(),
  // Estado do aceite: `status` sozinho não distingue quem já assinou.
  accepted_by_lessor: z.boolean().nullish(),
  accepted_by_lessee: z.boolean().nullish(),
  contract_status: z.string().nullish(),
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
