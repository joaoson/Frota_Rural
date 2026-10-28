import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authStore, clearAllStores, tokenStore } from "@/app/container";
import { parseJwt } from "@/shared/auth/jwt";

import { AuthContext, type AuthSession } from "./authContextValue";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = tokens !== null;

  const reset = useCallback(() => {
    setTokens(null);
    setUserId(null);
    setUserRole(null);
    clearAllStores();
  }, []);

  const login = useCallback((session: AuthSession, role?: string | null) => {
    const payload = parseJwt(session.access);
    setTokens(session);
    setUserId(payload?.user_id ?? null);
    // O papel vem da claim do token quando o chamador não informa.
    setUserRole(role ?? payload?.role ?? null);
    tokenStore.setAccessToken(session.access);
  }, []);

  const logout = useCallback(() => {
    void authStore.logout();
    reset();
  }, [reset]);

  // RefreshingHttpClient avisa aqui quando o refresh falha de vez
  useEffect(() => tokenStore.subscribeExpired(reset), [reset]);

  // Restaura a sessão pelo cookie de refresh ao carregar a página. Fica aqui, e
  // não no ProtectedRoute, para que toda rota já receba a resposta pronta.
  const hasBootstrapped = useRef(false);
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    void authStore
      .restoreSession()
      .then((access) => {
        if (access) login({ access }, parseJwt(access)?.role ?? null);
      })
      .finally(() => setIsLoading(false));
  }, [login]);

  const value = useMemo(
    () => ({
      tokens,
      userId,
      userRole,
      isAuthenticated,
      isLoading,
      login,
      setUserRole,
      logout,
    }),
    [tokens, userId, userRole, isAuthenticated, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
