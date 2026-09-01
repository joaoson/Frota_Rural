import type { HttpClient, HttpRequest, HttpResponse } from "../HttpClient";

/**
 * Decorator de observabilidade. O composition root só o inclui na cadeia sob
 * `import.meta.env.DEV`, então em produção ele não está *desligado* — está
 * ausente. Isso é o que uma cadeia composta permite e um interceptor global não.
 */
export class LoggingHttpClient implements HttpClient {
  private readonly inner: HttpClient;

  constructor(inner: HttpClient) {
    this.inner = inner;
  }

  async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const startedAt = performance.now();
    const label = `${request.method} ${request.path}`;

    try {
      const response = await this.inner.send<T>(request);
      console.log(
        `%cHTTP%c ${label} → ${response.status} (${Math.round(performance.now() - startedAt)}ms)`,
        "color:#7ee787",
        "",
      );
      return response;
    } catch (error) {
      console.error(
        `%cHTTP%c ${label} falhou (${Math.round(performance.now() - startedAt)}ms)`,
        "color:#f85149",
        "",
        error,
      );
      throw error;
    }
  }
}
