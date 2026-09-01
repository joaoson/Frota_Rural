/**
 * Porta de transporte HTTP.
 *
 * Declarada pelo consumidor (repositórios), implementada na borda por adapters.
 * Nenhum detalhe de axios atravessa esta interface — é o que permite trocar o
 * transporte, decorar a cadeia e testar repositórios sem rede.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | undefined | null;

export interface HttpRequest {
  method: HttpMethod;
  /** Caminho relativo à baseURL. Atenção à barra final: a API não é simétrica. */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

export interface HttpClient {
  send<T>(request: HttpRequest): Promise<HttpResponse<T>>;
}
