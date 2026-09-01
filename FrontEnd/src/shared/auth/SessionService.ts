import type { HttpClient } from "@/shared/http/HttpClient";

import type { InMemoryTokenStore } from "./InMemoryTokenStore";
import type { SessionPort } from "./SessionPort";

/** Sem barra final — a rota do backend é `path('login/refresh', ...)`. */
const REFRESH_PATH = "login/refresh";

/**
 * Implementação de SessionPort.
 *
 * Recebe o cliente HTTP **cru** (sem os decorators de auth/refresh) de
 * propósito: se o refresh passasse pelo RefreshingHttpClient, um 401 no próprio
 * refresh dispararia outro refresh. O composition root garante essa ligação.
 */
export class SessionService implements SessionPort {
  private readonly http: HttpClient;
  private readonly tokens: InMemoryTokenStore;

  constructor(http: HttpClient, tokens: InMemoryTokenStore) {
    this.http = http;
    this.tokens = tokens;
  }

  async refresh(): Promise<void> {
    const response = await this.http.send<{ access: string }>({
      method: "POST",
      path: REFRESH_PATH,
    });
    this.tokens.setAccessToken(response.data.access);
  }

  onExpired(): void {
    this.tokens.notifyExpired();
  }
}
