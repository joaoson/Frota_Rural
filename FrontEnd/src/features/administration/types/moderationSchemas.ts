import { z } from "zod";

const chatUserApiSchema = z.object({ id: z.string(), name: z.string(), role: z.string() });

const messageReportApiSchema = z.object({
  id: z.string(),
  reason: z.string(),
  reported_by: chatUserApiSchema.nullable(),
  created_at: z.string(),
  resolution: z.string().nullish(),
  resolved_at: z.string().nullish(),
  resolved_by: chatUserApiSchema.nullish(),
});

export const flaggedMessageApiSchema = z.object({
  message_id: z.string(),
  thread_id: z.string(),
  content: z.string().nullable(),
  sent_at: z.string(),
  hidden: z.boolean(),
  sender: chatUserApiSchema.nullable(),
  receiver: chatUserApiSchema.nullable(),
  source: z.enum(["report", "auto"]),
  reports: z.array(messageReportApiSchema),
});

export const flaggedPageApiSchema = z.object({
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  results: z.array(flaggedMessageApiSchema),
});

export type FlaggedMessageApi = z.infer<typeof flaggedMessageApiSchema>;
export type FlaggedPageApi = z.infer<typeof flaggedPageApiSchema>;
