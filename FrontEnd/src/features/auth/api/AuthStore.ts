import type { QueryClient } from "@tanstack/react-query";

import type { InMemoryTokenStore } from "@/shared/auth/InMemoryTokenStore";

import type { AuthRepository } from "./AuthRepository";

/**
 * Store de sessão.
 *
 * Guarda o access token através do TokenProvider e é quem limpa TODO o cache de
 * servidor no logout — sem isso, o próximo usuário na mesma aba enxergaria os
 * dados do anterior.
 */
export class AuthStore {
  private readonly repository: AuthRepository;
  private readonly tokens: InMemoryTokenStore;
  private readonly queryClient: QueryClient;

  constructor(
    repository: AuthRepository,
    tokens: InMemoryTokenStore,
    queryClient: QueryClient,
  ) {
    this.repository = repository;
    this.tokens = tokens;
    this.queryClient = queryClient;
  }

  async login(email: string, password: string): Promise<string> {
    const access = await this.repository.login(email, password);
    this.tokens.setAccessToken(access);
    return access;
  }

  /**
   * Tenta restaurar a sessão pelo cookie de refresh. Devolve o access token ou
   * null — não lança, porque "não havia sessão" é um caminho normal.
   */
  async restoreSession(): Promise<string | null> {
    try {
      const access = await this.repository.refresh();
      this.tokens.setAccessToken(access);
      return access;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.repository.logout();
    } finally {
      this.clear();
    }
  }

  requestPasswordReset(email: string): Promise<string> {
    return this.repository.requestPasswordReset(email);
  }

  confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    return this.repository.confirmPasswordReset(token, newPassword);
  }

  clear(): void {
    this.tokens.setAccessToken(null);
    this.queryClient.clear();
  }
}
