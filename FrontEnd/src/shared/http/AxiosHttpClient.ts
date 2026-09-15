import axios, { AxiosError, type AxiosInstance } from "axios";

import type { HttpClient, HttpRequest, HttpResponse } from "./HttpClient";
import {
  BadRequestError,
  ConflictError,
  type FieldErrors,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
  UnexpectedError,
} from "./errors";

export const DEFAULT_BASE_URL = "http://localhost:8000/api/";

// Erros de regra de negócio sem campo associado. O backend já os resume em
// `message`; mantê-los fora de `fieldErrors` evita que um formulário tente
// pendurar a mensagem num campo que não existe.
const NON_FIELD_ERRORS = "non_field_errors";

export function createAxiosInstance(baseURL?: string): AxiosInstance {
  return axios.create({
    // withCredentials é obrigatório pois refresh token vive num cookie httpOnly
    // com path=/api/login e só é enviado se as credenciais acompanharem
    baseURL: baseURL ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL,
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });
}

// Para APIs de terceiros e sem credenciais
export function createPublicAxiosInstance(baseURL: string): AxiosInstance {
  return axios.create({ baseURL });
}

interface ParsedErrorBody {
  apiCode?: string;
  message?: string;
  fieldErrors: FieldErrors;
}

// Parse do corpo único de erro do backend: {"code", "message", "errors"}
function parseErrorBody(data: unknown): ParsedErrorBody {
  const fieldErrors: FieldErrors = {};
  if (data === null || typeof data !== "object") {
    return { fieldErrors };
  }

  const body = data as Record<string, unknown>;
  const apiCode = typeof body.code === "string" ? body.code : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;

  if (body.errors !== null && typeof body.errors === "object") {
    for (const [field, value] of Object.entries(body.errors as Record<string, unknown>)) {
      if (field === NON_FIELD_ERRORS || !Array.isArray(value)) continue;
      const messages = value.filter((item): item is string => typeof item === "string");
      if (messages.length > 0) fieldErrors[field] = messages;
    }
  }

  return { apiCode, message, fieldErrors };
}

function firstFieldMessage(fieldErrors: FieldErrors): string | undefined {
  for (const messages of Object.values(fieldErrors)) {
    if (messages.length > 0) return messages[0];
  }
  return undefined;
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof AxiosError) {
    const response = error.response;
    if (!response) return new NetworkError(undefined, error);

    const { apiCode, message, fieldErrors } = parseErrorBody(response.data);
    const details = { apiCode, fieldErrors };

    switch (response.status) {
      case 400:
        return new BadRequestError(
          message ?? firstFieldMessage(fieldErrors) ?? "Dados inválidos.",
          fieldErrors,
          error,
          apiCode,
        );
      case 401:
        return new UnauthorizedError(message, error, details);
      case 403:
        return new ForbiddenError(message, error, details);
      case 404:
        return new NotFoundError(message, error, details);
      case 409:
        return new ConflictError(message, error, details);
      default:
        if (response.status >= 500) {
          return new ServerError(response.status, message, error, details);
        }
        return new UnexpectedError(message, error, details);
    }
  }

  return new UnexpectedError(undefined, error);
}

export class AxiosHttpClient implements HttpClient {
  private readonly axios: AxiosInstance;

  constructor(instance: AxiosInstance) {
    this.axios = instance;
  }

  async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    try {
      const response = await this.axios.request<T>({
        method: request.method,
        url: request.path,
        params: request.query,
        data: request.body,
        headers: request.headers,
        signal: request.signal,
      });
      return { status: response.status, data: response.data };
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
