import type { HttpClient } from "@/shared/http/HttpClient";
import type { FlaggedDecision, FlaggedMessage } from "../types/moderation";
import { flaggedPageApiSchema, type FlaggedMessageApi } from "../types/moderationSchemas";

import type { UserModerationAction } from "../types/moderation";

const USERS_BASE = "admin/users";
const POSTINGS_BASE = "admin/postings";

export interface ModerationRepository {
  listFlaggedMessages(status?: string): Promise<FlaggedMessage[]>;
  resolveFlaggedMessage(messageId: string, decision: FlaggedDecision, note?: string): Promise<void>;
  moderateUser(userId: string, action: UserModerationAction): Promise<string>;
  approvePosting(postingId: string): Promise<string>;
  rejectPosting(postingId: string, reason: string): Promise<string>;
}

function toFlaggedMessage(dto: FlaggedMessageApi): FlaggedMessage {
  return {
    messageId: dto.message_id,
    threadId: dto.thread_id,
    content: dto.content,
    sentAt: dto.sent_at,
    hidden: dto.hidden,
    sender: dto.sender,
    receiver: dto.receiver,
    source: dto.source,
    reports: dto.reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      reportedBy: r.reported_by,
      createdAt: r.created_at,
      resolution: r.resolution ?? null,
    })),
  };
}

export class HttpModerationRepository implements ModerationRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /** Todas as ações de usuário são PUT sem corpo — o backend ignora o body. */
  async moderateUser(userId: string, action: UserModerationAction): Promise<string> {
    const response = await this.http.send<{ message?: string }>({
      method: "PUT",
      path: `${USERS_BASE}/${userId}/${action}`,
    });
    return response.data?.message ?? "Ação aplicada.";
  }

  async approvePosting(postingId: string): Promise<string> {
    const response = await this.http.send<{ message?: string }>({
      method: "PUT",
      path: `${POSTINGS_BASE}/${postingId}/approve`,
    });
    return response.data?.message ?? "Anúncio aprovado.";
  }

  async rejectPosting(postingId: string, reason: string): Promise<string> {
    const response = await this.http.send<{ message?: string }>({
      method: "PUT",
      path: `${POSTINGS_BASE}/${postingId}/reject`,
      body: { reason },
    });
    return response.data?.message ?? "Anúncio reprovado.";
  }
  /** Fila de mensagens sinalizadas. `admin/chat/messages/` leva barra final. */
  async listFlaggedMessages(status = "pending"): Promise<FlaggedMessage[]> {
    const response = await this.http.send<unknown>({
      method: "GET",
      path: "admin/chat/messages/",
      query: { status },
    });
    return flaggedPageApiSchema.parse(response.data).results.map(toFlaggedMessage);
  }

  async resolveFlaggedMessage(
    messageId: string,
    decision: FlaggedDecision,
    note?: string,
  ): Promise<void> {
    await this.http.send<unknown>({
      method: "PUT",
      path: `admin/chat/messages/${messageId}/resolve`,
      body: { decision, ...(note ? { note } : {}) },
    });
  }

}
