import type { HttpClient } from "@/shared/http/HttpClient";
import type { PricingSuggestion, SuggestPricePayload } from "../types/pricing";
import { pricingSuggestionSchema } from "../types/pricingSchemas";

export interface PricingRepository {
  suggest(payload: SuggestPricePayload): Promise<PricingSuggestion>;
}

export class HttpPricingRepository implements PricingRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) { this.http = http; }

  async suggest(payload: SuggestPricePayload): Promise<PricingSuggestion> {
    const response = await this.http.send<unknown>({
      method: "POST", path: "pricing/suggest", body: payload,
    });
    return pricingSuggestionSchema.parse(response.data);
  }
}
