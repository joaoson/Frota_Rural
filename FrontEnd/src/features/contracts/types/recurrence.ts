import { z } from "zod";
import { rentalApiSchema } from "./rentalSchemas";
import type { Rental } from "./rental";

export const recurrenceFrequencySchema = z.enum(["weekly", "biweekly", "monthly"]);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;
export interface RecurrenceInput {
  first_start_date: string;
  frequency: RecurrenceFrequency;
  /** Número de reservas futuras; não inclui a locação de origem. */
  occurrences: number;
}
export interface CreateRecurrenceInput extends RecurrenceInput {
  idempotency_key: string;
}

const priceSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const seriesFields = {
  source_rental: z.string(),
  frequency: recurrenceFrequencySchema,
  occurrences: z.number().int().min(2).max(12),
  total_price: priceSchema,
};
export const recurrencePreviewSchema = z.object({
  ...seriesFields,
  dates: z.array(z.object({
    start_date: z.iso.datetime({ offset: true }),
    end_date: z.iso.datetime({ offset: true }),
    total_price: priceSchema,
  })),
});
export type RecurrencePreview = z.infer<typeof recurrencePreviewSchema>;
export const recurrenceCreatedSchema = z.object({
  ...seriesFields,
  id: z.string(),
  reservation_expires_at: z.iso.datetime({ offset: true }).nullish(),
  rentals: z.array(rentalApiSchema),
});
export type RecurrenceCreated = Omit<z.infer<typeof recurrenceCreatedSchema>, "rentals"> & { rentals: Rental[] };
