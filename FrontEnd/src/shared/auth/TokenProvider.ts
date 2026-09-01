/**
 * Porta de acesso ao token. Substituiu a variável de módulo `_accessToken` do
 * antigo `services/AxiosInstance.ts` (removido): quem precisa do token depende
 * desta interface, não de estado global mutável.
 */
export interface TokenProvider {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
}
