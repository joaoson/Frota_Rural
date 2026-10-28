import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { pricingStore } from "@/app/container";
import type { SuggestPricePayload } from "../types/pricing";

export function usePricingSuggestion(machinery: string) {
  const [selectedMachine, setSelectedMachine] = useState(machinery);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: SuggestPricePayload) => pricingStore.suggest(payload),
    retry: false,
  });
  // Detach the old request before rendering a different machine. A late
  // response cannot show or submit another selection's suggestion (A → B → A).
  if (selectedMachine !== machinery) {
    setSelectedMachine(machinery);
    setDismissedId(null);
    mutation.reset();
  }
  const isCurrent = mutation.variables?.machinery === machinery;
  const result = isCurrent ? mutation.data ?? null : null;
  return {
    suggestion: result?.suggestion_id === dismissedId ? null : result,
    // Keep the audit link when the owner dismisses the explanation or edits
    // the price. The backend compares the displayed suggestion to their choice.
    suggestionId: result?.suggestion_id,
    error: isCurrent ? mutation.error : null,
    isPending: isCurrent && mutation.isPending,
    request: () => {
      if (!machinery) return;
      setDismissedId(null);
      mutation.mutate({ machinery });
    },
    dismiss: () => setDismissedId(result?.suggestion_id ?? null),
  };
}
