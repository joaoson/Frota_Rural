import { createContext, useContext, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { setAccessToken } from "@/services/AxiosInstance";
import { userService } from "@/services/UserService/UserService";
import { parseJwt, type JwtPayload } from "@/utils/jwt";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  userId: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  login: (tokens: LoginUserResponse, role?: string | null) => void;
  setUserRole: (role: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<LoginUserResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAuthenticated = tokens !== null;

  function login(newTokens: LoginUserResponse, role?: string | null) {
    const payload = parseJwt<JwtPayload>(newTokens.access);
    setTokens(newTokens);
    setUserId(payload.user_id);
    if (role) setUserRole(role);
    setAccessToken(newTokens.access);
  }

  function logout() {
    userService.logout().catch(() => {});
    setTokens(null);
    setUserId(null);
    setUserRole(null);
    setAccessToken(null);
  }

  return (
    <AuthContext.Provider
      value={{ tokens, userId, userRole, isAuthenticated, login, setUserRole, logout }}
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
