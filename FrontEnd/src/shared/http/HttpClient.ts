export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | undefined | null;

export interface HttpRequest {
  method: HttpMethod;
  // Caminho relativo à baseURL
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  // `undefined` remove o header da instância — é assim que o axios calcula
  // o boundary de um multipart.
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

export interface HttpClient {
  send<T>(request: HttpRequest): Promise<HttpResponse<T>>;
}
