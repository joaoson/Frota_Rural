import { z } from "zod";

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const reviewApiSchema = z.object({
  id: z.string(),
  rental: z.string(),
  reviewer: z.string(),
  reviewer_name: z.string().nullish(),
  reviewee: z.string(),
  reviewee_name: z.string().nullish(),
  rating: z.number(),
  comment: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type ReviewApi = z.infer<typeof reviewApiSchema>;
export const reviewListApiSchema = z.array(reviewApiSchema);

export const reviewFormSchema = z.object({
  rating: z
    .number()
    .int()
    .min(MIN_RATING, "Selecione uma nota.")
    .max(MAX_RATING, `A nota deve ir de ${MIN_RATING} a ${MAX_RATING}.`),
  comment: z.string().trim(),
});
export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export interface CreateReviewPayload {
  rental: string;
  reviewer: string;
  reviewee: string;
  rating: number;
  comment?: string;
}
