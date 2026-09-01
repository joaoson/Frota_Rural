import type { SessionPort } from "@/shared/auth/SessionPort";

import type { HttpClient, HttpRequest, HttpResponse } from "../HttpClient";
import { UnauthorizedError } from "../errors";

/**
 * Decorator: renova o access token em 401 e repete a requisição uma vez.
 *
 * Duas diferenças em relação ao interceptor atual:
 *
 * 1. Requisições concorrentes compartilham um único refresh (`this.refreshing`).
 *    Hoje dois 401 simultâneos disparam dois refreshes.
 * 2. A repetição chama `this.inner.send`, não `this.send` — não há recursão,
 *    então não é preciso marcar a requisição com uma flag `_retry`.
 */
export class RefreshingHttpClient implements HttpClient {
  private readonly inner: HttpClient;
  private readonly session: SessionPort;
  private refreshing: Promise<void> | null = null;

  constructor(inner: HttpClient, session: SessionPort) {
    this.inner = inner;
    this.session = session;
  }

  async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    try {
      return await this.inner.send<T>(request);
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;

      try {
        await this.refreshOnce();
      } catch {
        this.session.onExpired();
        throw error;
      }

      return this.inner.send<T>(request);
    }
  }

  private refreshOnce(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.session.refresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }
}
