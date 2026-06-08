import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";

export const AdminPostingError = {
  MissingReason: "Informe o motivo da reprovação.",
  PostingNotFound: "Anúncio não encontrado.",
  ServerError: "Erro no servidor. Tente novamente mais tarde.",
} as const;

export type AdminPostingError =
  (typeof AdminPostingError)[keyof typeof AdminPostingError];

export class AdminPostingServiceError extends Error {
  constructor(message: AdminPostingError) {
    super(message);
  }
}

class AdminPostingService {
  private async moderate(
    pk: string,
    action: "approve" | "reject",
    reason?: string,
  ) {
    try {
      const response = await AxiosInstance.put(
        `admin/postings/${pk}/${action}`,
        action === "reject" ? { reason } : undefined,
      );
      return response.data as { message: string };
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400)
          throw new AdminPostingServiceError(AdminPostingError.MissingReason);
        if (status === 404)
          throw new AdminPostingServiceError(AdminPostingError.PostingNotFound);
      }
      throw new AdminPostingServiceError(AdminPostingError.ServerError);
    }
  }

  async approve(pk: string) {
    return this.moderate(pk, "approve");
  }

  async reject(pk: string, reason: string) {
    return this.moderate(pk, "reject", reason);
  }
}

export const adminPostingService = new AdminPostingService();
