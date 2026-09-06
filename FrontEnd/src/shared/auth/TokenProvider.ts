export interface TokenProvider {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
}
