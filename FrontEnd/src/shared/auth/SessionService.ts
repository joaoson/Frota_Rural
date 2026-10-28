import type { HttpClient } from "@/shared/http/HttpClient";

import type { InMemoryTokenStore } from "./InMemoryTokenStore";
import type { SessionPort } from "./SessionPort";

const REFRESH_PATH = "login/refresh";

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
