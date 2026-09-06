 // refresh() renova o access token
 // onExpired() sinaliza que a sessão expirou
export interface SessionPort {
  refresh(): Promise<void>;
  onExpired(): void;
}
