import { z } from "zod";

export const refundSchema = z.object({
  id: z.string(), amount: z.string().transform(Number),
  status: z.enum(["pending", "succeeded", "failed", "canceled"]),
});
export type RentalRefund = z.infer<typeof refundSchema>;
export const cancellationSchema = z.object({
  allowed: z.boolean(), refund_amount: z.string(), retained_amount: z.string(),
  reason_code: z.string(), policy_text: z.string(), policy_version: z.string(),
}).transform((v) => ({ allowed: v.allowed, refundAmount: Number(v.refund_amount), retainedAmount: Number(v.retained_amount),
  reasonCode: v.reason_code, policyText: v.policy_text, policyVersion: v.policy_version }));
export type CancellationQuote = z.infer<typeof cancellationSchema>;
export const amendmentSchema = z.object({
  id: z.string(), contract: z.string(), proposer: z.string(), proposer_name: z.string(), base_revision: z.string(),
  original_start: z.string(), original_end: z.string(), proposed_start: z.string(), proposed_end: z.string(),
  reason: z.string(), status: z.enum(["pending", "accepted", "rejected", "withdrawn", "expired"]),
  expires_at: z.string(),
}).transform((v) => ({ id: v.id, contractId: v.contract, proposerId: v.proposer, proposerName: v.proposer_name,
  baseRevision: v.base_revision, originalStart: new Date(v.original_start), originalEnd: new Date(v.original_end),
  proposedStart: new Date(v.proposed_start), proposedEnd: new Date(v.proposed_end), reason: v.reason,
  status: v.status, expiresAt: new Date(v.expires_at) }));
export type ContractAmendment = z.infer<typeof amendmentSchema>;
export interface AmendmentInput { baseRevision: string; proposedStart: string; proposedEnd: string; reason: string }
export type AmendmentDecision = "accept" | "reject" | "withdraw";
export const REFUND_LABELS: Record<RentalRefund["status"], string> = {
  pending: "Estorno em processamento", succeeded: "Estorno concluído", failed: "Estorno falhou", canceled: "Estorno cancelado",
};
