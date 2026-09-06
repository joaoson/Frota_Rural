export type FieldErrors = Record<string, string[]>;

export class HttpError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

/**
 * 400. O backend devolve DUAS formas para o mesmo status:
 * {campo: ["msg"]} -> fieldErrors
 * {"error": "..."} -> message
 */
export class BadRequestError extends HttpError {
  readonly fieldErrors: FieldErrors;

  constructor(message: string, fieldErrors: FieldErrors = {}, cause?: unknown) {
    super("bad_request", message, 400, cause);
    this.fieldErrors = fieldErrors;
  }

  // Primeira mensagem registrada quando existem vários erros para um campo
  firstErrorFor(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Sessão expirada.", cause?: unknown) {
    super("unauthorized", message, 401, cause);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Acesso negado.", cause?: unknown) {
    super("forbidden", message, 403, cause);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Recurso não encontrado.", cause?: unknown) {
    super("not_found", message, 404, cause);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflito com o estado atual do recurso.", cause?: unknown) {
    super("conflict", message, 409, cause);
  }
}

export class ServerError extends HttpError {
  constructor(status: number, message = "Erro no servidor.", cause?: unknown) {
    super("server_error", message, status, cause);
  }
}

// Offline, DNS, CORS, timeout
export class NetworkError extends HttpError {
  constructor(message = "Não foi possível conectar ao servidor.", cause?: unknown) {
    super("network_error", message, undefined, cause);
  }
}

export class UnexpectedError extends HttpError {
  constructor(message = "Erro inesperado.", cause?: unknown) {
    super("unexpected", message, undefined, cause);
  }
}
