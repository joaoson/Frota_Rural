import { HttpError } from "@/shared/http/errors";

/**
 * Um 401 vindo do login significa "credencial errada"; o mesmo 401 em qualquer
 * outra chamada significa "sessão expirada". Traduzir aqui impede que a UI
 * confunda os dois.
 */
export class InvalidCredentials extends HttpError {
  constructor(cause?: unknown) {
    super("invalid_credentials", "E-mail ou senha incorretos.", 401, cause);
  }
}

export class AccountDisabled extends HttpError {
  constructor(cause?: unknown) {
    super("account_disabled", "Esta conta está suspensa ou banida.", 403, cause);
  }
}

export class InvalidResetToken extends HttpError {
  constructor(cause?: unknown) {
    super("invalid_reset_token", "Link de redefinição inválido ou expirado.", 400, cause);
  }
}
