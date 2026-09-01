import { createContext } from "react";

export interface AuthSession {
  access: string;
}

export interface AuthContextValue {
  tokens: AuthSession | null;
  userId: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  login: (tokens: AuthSession, role?: string | null) => void;
  setUserRole: (role: string | null) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
