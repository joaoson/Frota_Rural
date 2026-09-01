import type { TokenProvider } from "./TokenProvider";

export type ExpiredListener = () => void;

/**
 * Guarda o access token apenas em memória (o refresh token vive num cookie
 * httpOnly, inacessível ao JS) e permite que interessados — o AuthProvider —
 * reajam à expiração da sessão.
 *
 * O registro de listeners resolve um bug real: `setLogoutCallback` existe em
 * `services/AxiosInstance.ts` mas nunca é chamado por ninguém, então o logout
 * automático do interceptor atual é um no-op.
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

  /** Inscreve-se na expiração. Devolve a função de cancelamento. */
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
