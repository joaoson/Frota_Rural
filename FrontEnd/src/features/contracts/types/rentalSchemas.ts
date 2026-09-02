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
