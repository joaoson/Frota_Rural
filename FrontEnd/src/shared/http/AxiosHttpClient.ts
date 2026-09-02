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

// Parse de erro do backend nas duas formas que ele usa
// {"error": "..."}` / `{"detail": "..."}` viram mensagem plana
// {campo: ["msg"]}` vira `fieldErrors`
function parseErrorBody(data: unknown): { message?: string; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  if (data === null || typeof data !== "object") {
    return { fieldErrors };
  }

  let message: string | undefined;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if ((key === "error" || key === "detail") && typeof value === "string") {
      message = value;
      continue;
    }
    if (Array.isArray(value)) {
      const messages = value.filter((item): item is string => typeof item === "string");
      if (messages.length > 0) fieldErrors[key] = messages;
    } else if (typeof value === "string") {
      fieldErrors[key] = [value];
    }
  }

  return { message, fieldErrors };
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

    const { message, fieldErrors } = parseErrorBody(response.data);

    switch (response.status) {
      case 400:
        return new BadRequestError(
          message ?? firstFieldMessage(fieldErrors) ?? "Dados inválidos.",
          fieldErrors,
          error,
        );
      case 401:
        return new UnauthorizedError(message, error);
      case 403:
        return new ForbiddenError(message, error);
      case 404:
        return new NotFoundError(message, error);
      case 409:
        return new ConflictError(message, error);
      default:
        if (response.status >= 500) return new ServerError(response.status, message, error);
        return new UnexpectedError(message, error);
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
