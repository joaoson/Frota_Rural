import { createContext, useContext, useEffect, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { userService } from "@/services/UserService/UserService";
import { setAccessToken, setLogoutCallback } from "@/services/AxiosInstance";
import { parseJwt, type JwtPayload } from "@/utils/jwt";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  userId: string | null;
  isAuthenticated: boolean;
  login: (tokens: LoginUserResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<LoginUserResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const isAuthenticated = tokens !== null;

  function login(newTokens: LoginUserResponse) {
    const payload = parseJwt<JwtPayload>(newTokens.access);
    setTokens(newTokens);
    setUserId(payload.user_id);
    setAccessToken(newTokens.access);
  }

  function logout() {
    userService.logout().catch(() => {});
    setTokens(null);
    setUserId(null);
    setAccessToken(null);
  }

  useEffect(() => {
    // Conecta o logout do AuthContext com AxiosInstance
    // Ocorre pois, se AxiosInstance falhar ao fazer refresh do token, ele
    // chama a função de logout do AuthContext e UserService
    setLogoutCallback(logout);
  }, []);

  return (
    <AuthContext.Provider
      value={{ tokens, userId, isAuthenticated, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
