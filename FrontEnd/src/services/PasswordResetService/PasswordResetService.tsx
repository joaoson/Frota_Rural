import { AxiosError } from "axios";
import { AxiosInstance } from "@/services/AxiosInstance";
import type { PasswordResetConfirmRequest } from "../PasswordResetService/models/PasswordResetConfirmRequest";
import type { PasswordResetRequest } from "./models/PasswordResetRequest";
import {
  PasswordResetError,
  PasswordResetServiceError,
} from "./errors/PasswordResetError";

class PasswordResetService {
  private REQUEST_RESET_ENDPOINT = "password-reset/request";
  private CONFIRM_RESET_ENDPOINT = "password-reset/confirm";

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    try {
      await AxiosInstance.post(this.REQUEST_RESET_ENDPOINT, data);
    } catch {
      throw new PasswordResetServiceError(
        PasswordResetError.PasswordResetServerError,
      );
    }
  }

  async confirmPasswordReset(data: PasswordResetConfirmRequest): Promise<void> {
    try {
      await AxiosInstance.post(this.CONFIRM_RESET_ENDPOINT, data);
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 400) {
          throw new PasswordResetServiceError(
            PasswordResetError.PasswordResetTokenInvalid,
          );
        }
      }
      throw new PasswordResetServiceError(
        PasswordResetError.PasswordResetServerError,
      );
    }
  }
}

export const passwordResetService = new PasswordResetService();
