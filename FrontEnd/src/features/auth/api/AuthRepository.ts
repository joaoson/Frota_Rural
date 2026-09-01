import type { HttpClient } from "@/shared/http/HttpClient";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "@/shared/http/errors";

import { accessTokenSchema } from "../types/authSchemas";
import {
  AccountDisabled,
  InvalidCredentials,
  InvalidResetToken,
} from "../types/authErrors";

/** Nenhuma rota de autenticação tem barra final. */
const LOGIN_PATH = "login";
const REFRESH_PATH = "login/refresh";
const LOGOUT_PATH = "logout";
const RESET_REQUEST_PATH = "password-reset/request";
const RESET_CONFIRM_PATH = "password-reset/confirm";

export interface AuthRepository {
  login(email: string, password: string): Promise<string>;
  /** Renova a sessão a partir do cookie httpOnly. Sem corpo. */
  refresh(): Promise<string>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<string>;
  confirmPasswordReset(token: string, newPassword: string): Promise<void>;
}

/**
 * Recebe o HttpClient **cru**, sem os decorators de auth/refresh.
 *
 * Se o login passasse pelo RefreshingHttpClient, uma credencial errada (401)
 * dispararia uma tentativa de refresh antes de falhar — comportamento errado e
 * confuso de depurar.
 */
export class HttpAuthRepository implements AuthRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async login(email: string, password: string): Promise<string> {
    try {
      const response = await this.http.send<unknown>({
        method: "POST",
        path: LOGIN_PATH,
        body: { email, password },
      });
      return accessTokenSchema.parse(response.data).access;
    } catch (error) {
      if (error instanceof UnauthorizedError) throw new InvalidCredentials(error);
      if (error instanceof ForbiddenError) throw new AccountDisabled(error);
      throw error;
    }
  }

  async refresh(): Promise<string> {
    const response = await this.http.send<unknown>({ method: "POST", path: REFRESH_PATH });
    return accessTokenSchema.parse(response.data).access;
  }

  async logout(): Promise<void> {
    await this.http.send<unknown>({ method: "POST", path: LOGOUT_PATH });
  }

  /** Responde sempre 200, mesmo para e-mail inexistente — é intencional no backend. */
  async requestPasswordReset(email: string): Promise<string> {
    const response = await this.http.send<{ message?: string }>({
      method: "POST",
      path: RESET_REQUEST_PATH,
      body: { email },
    });
    return response.data?.message ?? "Se existir uma conta com esse e-mail, enviamos um link.";
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    try {
      await this.http.send<unknown>({
        method: "POST",
        path: RESET_CONFIRM_PATH,
        body: { token, new_password: newPassword },
      });
    } catch (error) {
      // O backend usa 400 tanto para erro de campo quanto para token inválido,
      // distinguindo apenas pela chave `detail` — que vira `message` no adapter.
      if (error instanceof BadRequestError && !error.hasFieldErrors) {
        throw new InvalidResetToken(error);
      }
      throw error;
    }
  }
}
