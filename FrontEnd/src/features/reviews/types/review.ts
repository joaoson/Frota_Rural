export interface Review {
  id: string;
  rentalId: string;
  reviewerId: string;
  reviewerName: string | null;
  revieweeId: string;
  revieweeName: string | null;
  rating: number;
  comment: string | null;
  createdAt: Date | null;
}

/** Média das notas. Devolve null quando não há avaliação — não 0. */
export function averageRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return total / reviews.length;
}

export function hasReviewedRental(reviews: Review[], rentalId: string): boolean {
  return reviews.some((review) => review.rentalId === rentalId);
}
