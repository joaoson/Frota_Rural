import type { TokenProvider } from "./TokenProvider";

export type ExpiredListener = () => void;

/**
 * Guarda o access token apenas em memória (o refresh token em cookie
 * httpOnly) e permite que entidades (AuthProvider) reajam à expiração da sessão
 */
export class InMemoryTokenStore implements TokenProvider {
  private accessToken: string | null = null;
  private readonly listeners = new Set<ExpiredListener>();

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  subscribeExpired(listener: ExpiredListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyExpired(): void {
    this.accessToken = null;
    this.listeners.forEach((listener) => listener());
  }
}
