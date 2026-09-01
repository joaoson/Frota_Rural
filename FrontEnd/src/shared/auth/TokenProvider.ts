/**
 * Porta de acesso ao token. Substitui a variável de módulo `_accessToken` de
 * `services/AxiosInstance.ts`: quem precisa do token depende desta interface,
 * não de estado global mutável.
 */
export interface TokenProvider {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
}
