import type { SessionPort } from "@/shared/auth/SessionPort";

import type { HttpClient, HttpRequest, HttpResponse } from "../HttpClient";
import { UnauthorizedError } from "../errors";

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
