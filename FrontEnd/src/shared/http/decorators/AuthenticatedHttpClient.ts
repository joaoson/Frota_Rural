import type { TokenProvider } from "@/shared/auth/TokenProvider";

import type { HttpClient, HttpRequest, HttpResponse } from "../HttpClient";

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
