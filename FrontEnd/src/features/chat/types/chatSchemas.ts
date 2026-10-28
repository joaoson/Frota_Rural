import { z } from "zod";

export const chatScopeSchema = z.enum(["rental", "posting"]);

export const chatUserApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});

export const chatMessageApiSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  sender_id: z.string(),
  receiver_id: z.string(),
  // null quando `hidden`: a UI mostra o placeholder da moderação
  content: z.string().nullable(),
  sent_at: z.string(),
  read_at: z.string().nullish(),
  flagged_for_moderation: z.boolean(),
  hidden: z.boolean(),
  client_id: z.string().nullish(),
});

export const chatThreadApiSchema = z.object({
  thread_id: z.string(),
  scope: chatScopeSchema,
  scope_id: z.string(),
  scope_label: z.string(),
  peer: chatUserApiSchema.nullable(),
  can_write: z.boolean(),
  unread_count: z.number(),
  last_message: chatMessageApiSchema.nullable(),
});

export const threadPageApiSchema = z.object({
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  results: z.array(chatThreadApiSchema),
});

export const messagePageApiSchema = z.object({
  results: z.array(chatMessageApiSchema),
  has_more: z.boolean(),
  order: z.enum(["asc", "desc"]),
});

export const unreadCountsApiSchema = z.object({
  unread_total: z.number(),
  unread_threads: z.number(),
});

export const markReadApiSchema = z.object({
  updated: z.number(),
  read_at: z.string(),
  unread_total: z.number(),
});

export type ChatScope = z.infer<typeof chatScopeSchema>;
export type ChatUserApi = z.infer<typeof chatUserApiSchema>;
export type ChatMessageApi = z.infer<typeof chatMessageApiSchema>;
export type ChatThreadApi = z.infer<typeof chatThreadApiSchema>;
export type ThreadPageApi = z.infer<typeof threadPageApiSchema>;
export type MessagePageApi = z.infer<typeof messagePageApiSchema>;
export type UnreadCountsApi = z.infer<typeof unreadCountsApiSchema>;
export type MarkReadApi = z.infer<typeof markReadApiSchema>;

export interface MessageCursor {
  before?: string;
  before_id?: string;
  after?: string;
  after_id?: string;
  limit?: number;
}
