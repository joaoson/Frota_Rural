import { createContext } from "react";

export interface AuthSession {
  access: string;
}

export interface AuthContextValue {
  tokens: AuthSession | null;
  userId: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  // Falso só depois que a tentativa de restaurar a sessão pelo cookie termina.
  isLoading: boolean;
  login: (tokens: AuthSession, role?: string | null) => void;
  setUserRole: (role: string | null) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
