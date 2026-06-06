export type CNHValidationResult = {
  is_valid: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
  error?: string;
};
