import { createContext, useContext, useEffect, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { userService } from "@/services/UserService/UserService";
import { setAccessToken, setLogoutCallback } from "@/services/AxiosInstance";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  isAuthenticated: boolean;
  login: (tokens: LoginUserResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<LoginUserResponse | null>(null);
  const isAuthenticated = tokens !== null;

  function login(newTokens: LoginUserResponse) {
    setTokens(newTokens); // Para AuthContext
    setAccessToken(newTokens.access); // Para AxiosInstance interceptor
  }

  function logout() {
    userService.logout().catch(() => {});
    setTokens(null);
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
      value={{ tokens, isAuthenticated, login, logout }}
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
