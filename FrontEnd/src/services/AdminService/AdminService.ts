import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";

export const AdminError = {
  AlreadyAtOrAboveState:
    "Usuário já está em um estado igual ou superior ao solicitado.",
  UserNotFound: "Usuário não encontrado.",
  ServerError: "Erro no servidor. Tente novamente mais tarde.",
} as const;

export type AdminError = (typeof AdminError)[keyof typeof AdminError];

export class AdminServiceError extends Error {
  constructor(message: AdminError) {
    super(message);
  }
}

class AdminService {
  private endpointFor(pk: string, action: "warn" | "suspend" | "ban") {
    return `admin/users/${pk}/${action}`;
  }

  private async moderate(pk: string, action: "warn" | "suspend" | "ban") {
    try {
      const response = await AxiosInstance.put(this.endpointFor(pk, action));
      return response.data as { message: string };
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 400) throw new AdminServiceError(AdminError.AlreadyAtOrAboveState);
        if (status === 404) throw new AdminServiceError(AdminError.UserNotFound);
      }
      throw new AdminServiceError(AdminError.ServerError);
    }
  }

  async warn(pk: string) {
    return this.moderate(pk, "warn");
  }

  async suspend(pk: string) {
    return this.moderate(pk, "suspend");
  }

  async ban(pk: string) {
    return this.moderate(pk, "ban");
  }
}

export const adminService = new AdminService();
