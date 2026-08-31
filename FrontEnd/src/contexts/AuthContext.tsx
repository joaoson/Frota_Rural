import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { setAccessToken, setLogoutCallback } from "@/services/AxiosInstance";
import { userService } from "@/services/UserService/UserService";
import { parseJwt, type JwtPayload } from "@/utils/jwt";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  userId: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tokens: LoginUserResponse, role?: string | null) => void;
  setUserRole: (role: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<LoginUserResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = tokens !== null;

  const login = useCallback(
    (newTokens: LoginUserResponse, role?: string | null) => {
      const payload = parseJwt<JwtPayload>(newTokens.access);
      setTokens(newTokens);
      setUserId(payload.user_id);
      if (role) setUserRole(role);
      setAccessToken(newTokens.access);
    },
    [],
  );

  const clearSession = useCallback(() => {
    setTokens(null);
    setUserId(null);
    setUserRole(null);
    setAccessToken(null);
  }, []);

  const logout = useCallback(() => {
    userService.logout().catch(() => {});
    clearSession();
  }, [clearSession]);

  // Permite que o interceptor do Axios limpe o estado quando o refresh falha
  useEffect(() => {
    setLogoutCallback(clearSession);
  }, [clearSession]);

  // Restaura a sessão a partir do cookie de refresh ao carregar/recarregar a página
  const hasBootstrapped = useRef(false);
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    userService
      .silentRefresh()
      .then(async (response) => {
        const payload = parseJwt<JwtPayload>(response.access);
        try {
          const user = await userService.getById(payload.user_id);
          login(response, user.role);
        } catch {
          login(response);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [login]);

  return (
    <AuthContext.Provider
      value={{ tokens, userId, userRole, isAuthenticated, isLoading, login, setUserRole, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
