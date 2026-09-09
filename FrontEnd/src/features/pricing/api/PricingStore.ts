import type { PricingSuggestion, SuggestPricePayload } from "../types/pricing";
import type { PricingRepository } from "./PricingRepository";

/** Suggestions create an audit record: each explicit request is a mutation. */
export class PricingStore {
  private readonly repository: PricingRepository;

  constructor(repository: PricingRepository) { this.repository = repository; }

  suggest(payload: SuggestPricePayload): Promise<PricingSuggestion> {
    return this.repository.suggest(payload);
  }

  clear(): void { /* No retained server state; results belong to the form. */ }
}
