import type { TokenProvider } from "@/shared/auth/TokenProvider";

import type { HttpClient, HttpRequest, HttpResponse } from "../HttpClient";

/**
 * Decorator: anexa o header Authorization.
 *
 * Fica DENTRO do RefreshingHttpClient na cadeia, então a repetição após um
 * refresh passa por aqui de novo e pega o token novo automaticamente. É o que
 * dispensa a reatribuição manual de header que o interceptor atual faz em
 * `services/AxiosInstance.ts`.
 */
export class AuthenticatedHttpClient implements HttpClient {
  private readonly inner: HttpClient;
  private readonly tokens: TokenProvider;

  constructor(inner: HttpClient, tokens: TokenProvider) {
    this.inner = inner;
    this.tokens = tokens;
  }

  send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const token = this.tokens.getAccessToken();
    if (!token) return this.inner.send<T>(request);

    return this.inner.send<T>({
      ...request,
      headers: { ...request.headers, Authorization: `Bearer ${token}` },
    });
  }
}
