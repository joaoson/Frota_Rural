import axios, { AxiosError, type AxiosInstance } from "axios";

import { getApiBaseUrl } from "./apiUrls";
import type { HttpClient, HttpRequest, HttpResponse } from "./HttpClient";
import {
  type ApiErrorBody,
  BadRequestError,
  ConflictError,
  type FieldErrors,
  ForbiddenError,
  HttpError,
  type HttpErrorDetails,
  NetworkError,
  NotFoundError,
  RequestCanceledError,
  ServerError,
  UnauthorizedError,
  UnexpectedError,
} from "./errors";

export { DEFAULT_BASE_URL } from "./apiUrls";

// Business-rule errors must not be attached to a nonexistent form field.
const NON_FIELD_ERRORS = "non_field_errors";

export function createAxiosInstance(baseURL?: string): AxiosInstance {
  return axios.create({
    // withCredentials é obrigatório pois refresh token vive num cookie httpOnly
    // com path=/api/login e só é enviado se as credenciais acompanharem
    baseURL: getApiBaseUrl(baseURL),
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });
}

// Para APIs de terceiros e sem credenciais
export function createPublicAxiosInstance(baseURL: string): AxiosInstance {
  return axios.create({ baseURL });
}

interface ParsedErrorBody extends HttpErrorDetails {
  message?: string;
  fieldErrors: FieldErrors;
  nonFieldErrors: string[];
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

// Accept the structured API envelope and feature endpoints that still return
// DRF field errors or { error/detail }. Both forms retain useful validation text.
function parseErrorBody(data: unknown): ParsedErrorBody {
  const fieldErrors: FieldErrors = {};
  const nonFieldErrors: string[] = [];
  if (data === null || typeof data !== "object") {
    return { fieldErrors, nonFieldErrors };
  }

  const body = data as Partial<ApiErrorBody> & Record<string, unknown>;
  const apiCode = typeof body.code === "string" ? body.code : undefined;
  const message = [body.message, body.error, body.detail].find((value): value is string => typeof value === "string");

  const structured = body.errors !== null && typeof body.errors === "object" && !Array.isArray(body.errors);
  const errors = structured ? body.errors as Record<string, unknown> : body;
  for (const [field, value] of Object.entries(errors)) {
    if (!structured && ["code", "message", "error", "detail", "errors"].includes(field)) continue;
    const messages = stringList(value);
    if (messages.length === 0) continue;
    if (field === NON_FIELD_ERRORS) {
      nonFieldErrors.push(...messages);
    } else {
      fieldErrors[field] = messages;
    }
  }

  return { apiCode, message, fieldErrors, nonFieldErrors };
}

function firstMessage({ fieldErrors, nonFieldErrors }: ParsedErrorBody): string | undefined {
  if (nonFieldErrors.length > 0) return nonFieldErrors[0];
  for (const messages of Object.values(fieldErrors)) {
    if (messages.length > 0) return messages[0];
  }
  return undefined;
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  const isAbortError = (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
  if (axios.isCancel(error) || isAbortError) {
    return new RequestCanceledError(error);
  }

  if (error instanceof AxiosError) {
    const response = error.response;
    if (!response) return new NetworkError(undefined, error);

    const parsed = parseErrorBody(response.data);
    const { apiCode, fieldErrors, nonFieldErrors } = parsed;
    const details: HttpErrorDetails = { apiCode, fieldErrors, nonFieldErrors };
    // `message` só falta quando o corpo não veio do nosso handler (um proxy, por
    // exemplo); aí a primeira mensagem disponível é melhor que o texto padrão.
    const message = parsed.message ?? firstMessage(parsed);

    switch (response.status) {
      case 400:
        return new BadRequestError(message, error, details);
      case 401:
        return new UnauthorizedError(message, error, details);
      case 403:
        return new ForbiddenError(message, error, details);
      case 404:
        return new NotFoundError(message, error, details);
      case 422:
        return new HttpError("unprocessable_entity", message ?? "Não foi possível processar os dados.", 422, error, details);
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
