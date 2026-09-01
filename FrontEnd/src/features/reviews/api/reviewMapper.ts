import type { Review } from "../types/review";
import type { ReviewApi } from "../types/reviewSchemas";

export function toDomain(dto: ReviewApi): Review {
  return {
    id: dto.id,
    rentalId: dto.rental,
    reviewerId: dto.reviewer,
    reviewerName: dto.reviewer_name ?? null,
    revieweeId: dto.reviewee,
    revieweeName: dto.reviewee_name ?? null,
    rating: dto.rating,
    comment: dto.comment ?? null,
    createdAt: dto.created_at ? new Date(dto.created_at) : null,
  };
}
