export type FieldErrors = Record<string, string[]>;

/**
 * Corpo único de erro do backend:
 * {"code": "validation_error", "message": "Dados inválidos.", "errors": {campo: ["msg"]}}
 *
 * Erro aninhado chega com a chave pontuada (`photos.1.url`), e erro de regra de
 * negócio sem campo vem em `errors.non_field_errors`, repetido em `message`.
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
  nonFieldErrors?: string[];
}

export interface FieldError {
  field: string;
  message: string;
}

export class HttpError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly apiCode?: string;
  readonly fieldErrors: FieldErrors;
  // Erros de regra de negócio sem campo associado (`non_field_errors`).
  readonly nonFieldErrors: string[];

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
    this.nonFieldErrors = details.nonFieldErrors ?? [];
  }

  // Primeira mensagem registrada quando existem vários erros para um campo
  firstErrorFor(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }

  /**
   * Primeiro erro de campo, na ordem em que o backend mandou.
   *
   * Serve de mensagem para quem não tem onde pendurar o erro: campo que a tela
   * não mapeia, campo preenchido pelo servidor (`user`, `owner`, `status`) ou
   * chave pontuada de um serializer aninhado. Sem isto sobraria o `message`
   * genérico ("Dados inválidos."), que não diz o que está errado.
   */
  firstFieldError(): FieldError | undefined {
    for (const [field, messages] of Object.entries(this.fieldErrors)) {
      if (messages.length > 0) return { field, message: messages[0] };
    }
    return undefined;
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

// 400. Erros por campo em `fieldErrors`; erro geral (sem campo) em `message`.
export class BadRequestError extends HttpError {
  constructor(message = "Dados inválidos.", cause?: unknown, details?: HttpErrorDetails) {
    super("bad_request", message, 400, cause, details);
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
