import type { HttpClient } from "@/shared/http/HttpClient";

import type { UserModerationAction } from "../types/moderation";

/** Nenhuma rota de moderação tem barra final. */
const USERS_BASE = "admin/users";
const POSTINGS_BASE = "admin/postings";

export interface ModerationRepository {
  moderateUser(userId: string, action: UserModerationAction): Promise<string>;
  approvePosting(postingId: string): Promise<string>;
  rejectPosting(postingId: string, reason: string): Promise<string>;
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

  /**
   * O backend valida `reason` ANTES de procurar o anúncio: motivo vazio em um id
   * inexistente devolve 400, não 404.
   */
  async rejectPosting(postingId: string, reason: string): Promise<string> {
    const response = await this.http.send<{ message?: string }>({
      method: "PUT",
      path: `${POSTINGS_BASE}/${postingId}/reject`,
      body: { reason },
    });
    return response.data?.message ?? "Anúncio reprovado.";
  }
}
