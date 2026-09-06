import type { HttpClient } from "@/shared/http/HttpClient";

import type { Review } from "../types/review";
import {
  type CreateReviewPayload,
  reviewApiSchema,
  reviewListApiSchema,
} from "../types/reviewSchemas";
import { toDomain } from "./reviewMapper";

const COLLECTION_PATH = "reviews/";

export interface ReviewFilter {
  revieweeId?: string;
  reviewerId?: string;
  rentalId?: string;
}

export interface ReviewRepository {
  find(filter: ReviewFilter): Promise<Review[]>;
  create(payload: CreateReviewPayload): Promise<Review>;
  remove(id: string): Promise<void>;
}

export class HttpReviewRepository implements ReviewRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async find(filter: ReviewFilter): Promise<Review[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: COLLECTION_PATH,
      query: {
        reviewee: filter.revieweeId,
        reviewer: filter.reviewerId,
        rental: filter.rentalId,
      },
    });
    return reviewListApiSchema.parse(response.data).map(toDomain);
  }

  async create(payload: CreateReviewPayload): Promise<Review> {
    const response = await this.http.send<unknown>({
      method: "POST",
      path: COLLECTION_PATH,
      body: payload,
    });
    return toDomain(reviewApiSchema.parse(response.data));
  }

  async remove(id: string): Promise<void> {
    await this.http.send<unknown>({ method: "DELETE", path: `reviews/${id}` });
  }
}
