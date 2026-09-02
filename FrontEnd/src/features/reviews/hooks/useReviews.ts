import { useMutation, useQuery } from "@tanstack/react-query";

import { reviewStore } from "@/app/container";

import type { ReviewFilter } from "../api/ReviewRepository";
import type { Review } from "../types/review";
import type { CreateReviewPayload } from "../types/reviewSchemas";

export function useReviews(filter: ReviewFilter, enabled = true) {
  return useQuery({ ...reviewStore.listOptions(filter), enabled });
}

export function useReceivedReviews(userId: string | null) {
  return useReviews({ revieweeId: userId ?? undefined }, Boolean(userId));
}

export function useWrittenReviews(userId: string | null) {
  return useReviews({ reviewerId: userId ?? undefined }, Boolean(userId));
}

export function useCreateReview() {
  return useMutation<Review, Error, CreateReviewPayload>({
    mutationFn: (payload) => reviewStore.create(payload),
    onSuccess: () => {
      void reviewStore.invalidateLists();
    },
  });
}

export function useDeleteReview() {
  return useMutation<void, Error, string>({
    mutationFn: (id) => reviewStore.remove(id),
    onSuccess: () => {
      void reviewStore.invalidateLists();
    },
  });
}
