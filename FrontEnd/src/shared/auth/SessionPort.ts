/**
 * Porta de ciclo de vida da sessão, usada pelo RefreshingHttpClient.
 *
 * `refresh()` renova o access token; `onExpired()` sinaliza que a sessão
 * acabou e não há como recuperá-la.
 */
export interface SessionPort {
  refresh(): Promise<void>;
  onExpired(): void;
}
