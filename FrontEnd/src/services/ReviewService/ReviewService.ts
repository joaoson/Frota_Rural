import { AxiosInstance } from "../AxiosInstance";

export interface Review {
  id: string;
  rental: string;
  reviewer: string;
  reviewer_name: string;
  reviewee: string;
  reviewee_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export const reviewService = {
  getReviewsByReviewee: async (userId: string): Promise<Review[]> => {
    const response = await AxiosInstance.get<Review[]>(`/reviews/?reviewee=${userId}`);
    return response.data;
  },

  getReviewsByReviewer: async (userId: string): Promise<Review[]> => {
    const response = await AxiosInstance.get<Review[]>(`/reviews/?reviewer=${userId}`);
    return response.data;
  },

  createReview: async (data: Partial<Review>): Promise<Review> => {
    const response = await AxiosInstance.post<Review>(`/reviews/`, data);
    return response.data;
  },

  deleteReview: async (id: string): Promise<void> => {
    await AxiosInstance.delete(`/reviews/${id}`);
  },
};
