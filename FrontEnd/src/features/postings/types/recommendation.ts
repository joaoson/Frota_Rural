import { z } from "zod";
import type { PostingListItem } from "./posting";
import { postingListItemApiSchema } from "./postingSchemas";
import type { BrazilianState } from "@/shared/lib/brazil";

export type MachineApplication = "soil_preparation" | "planting" | "spraying" | "harvesting";
export type SoilType = "clay" | "sand" | "mixed" | "unknown";

export interface MachineNeeds {
  application: MachineApplication;
  soil: SoilType;
  state: BrazilianState;
  startDate: string | null;
  endDate: string | null;
}

export interface MachineRecommendations {
  results: { posting: PostingListItem; reasons: string[]; soilMentioned: boolean }[];
  total: number;
  datesChecked: boolean;
  matchType: "exact" | "similar" | "none";
  aiUnavailable: boolean;
}

export const machineRecommendationsApiSchema = z.object({
  results: z.array(z.object({
    posting: postingListItemApiSchema,
    reasons: z.array(z.string()),
    soil_mentioned: z.boolean(),
  })),
  total: z.number().int().nonnegative(),
  dates_checked: z.boolean(),
  match_type: z.enum(["exact", "similar", "none"]),
  ai_unavailable: z.boolean(),
});
