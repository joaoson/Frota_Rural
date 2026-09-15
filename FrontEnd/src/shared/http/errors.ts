export type FieldErrors = Record<string, string[]>;

/**
 * Corpo único de erro do backend:
 * {"code": "validation_error", "message": "Dados inválidos.", "errors": {campo: ["msg"]}}
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  errors: FieldErrors;
}

export interface HttpErrorDetails {
  // `code` estável devolvido pelo backend (ex.: "invalid_credentials", "already_signed")
  apiCode?: string;
  fieldErrors?: FieldErrors;
}

export class HttpError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly apiCode?: string;
  readonly fieldErrors: FieldErrors;

  constructor(
    code: string,
    message: string,
    status?: number,
    cause?: unknown,
    details: HttpErrorDetails = {},
  ) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.apiCode = details.apiCode;
    this.fieldErrors = details.fieldErrors ?? {};
  }

  // Primeira mensagem registrada quando existem vários erros para um campo
  firstErrorFor(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

// 400. Erros por campo em `fieldErrors`; erro geral (sem campo) em `message`.
export class BadRequestError extends HttpError {
  constructor(message: string, fieldErrors: FieldErrors = {}, cause?: unknown, apiCode?: string) {
    super("bad_request", message, 400, cause, { apiCode, fieldErrors });
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Sessão expirada.", cause?: unknown, details?: HttpErrorDetails) {
    super("unauthorized", message, 401, cause, details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Acesso negado.", cause?: unknown, details?: HttpErrorDetails) {
    super("forbidden", message, 403, cause, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Recurso não encontrado.", cause?: unknown, details?: HttpErrorDetails) {
    super("not_found", message, 404, cause, details);
  }
}

// 409. Pode trazer `fieldErrors` (ex.: e-mail cadastrado por outra requisição simultânea).
export class ConflictError extends HttpError {
  constructor(
    message = "Conflito com o estado atual do recurso.",
    cause?: unknown,
    details?: HttpErrorDetails,
  ) {
    super("conflict", message, 409, cause, details);
  }
}

export class ServerError extends HttpError {
  constructor(
    status: number,
    message = "Erro no servidor.",
    cause?: unknown,
    details?: HttpErrorDetails,
  ) {
    super("server_error", message, status, cause, details);
  }
}

// Offline, DNS, CORS, timeout
export class NetworkError extends HttpError {
  constructor(message = "Não foi possível conectar ao servidor.", cause?: unknown) {
    super("network_error", message, undefined, cause);
  }
}

export class UnexpectedError extends HttpError {
  constructor(message = "Erro inesperado.", cause?: unknown, details?: HttpErrorDetails) {
    super("unexpected", message, undefined, cause, details);
  }
}
