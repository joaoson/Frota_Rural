import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { userService } from "@/services/UserService/UserService";
import { toast } from "sonner";
import {
  UserError,
  UserServiceError,
} from "@/services/UserService/errors/UserError";
import { AppConstants } from "./Constants";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  isAuthenticated: boolean;
  isVerifying: boolean;
  login: (tokens: LoginUserResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sessionCorrupted = useRef(false);

  const [tokens, setTokens] = useState<LoginUserResponse | null>(() => {
    try {
      const raw = localStorage.getItem(AppConstants.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LoginUserResponse) : null;
    } catch {
      sessionCorrupted.current = true;
      return null;
    }
  });

  useEffect(() => {
    if (!sessionCorrupted.current) return;
    logout();
    toast.error(UserError.AuthError);
  }, []);

  const [isVerifying, setIsVerifying] = useState(tokens !== null);
  const isAuthenticated = tokens !== null;

  /// This will fire on every page reload.
  /// The intention is to check if the user is falsifying tokens in the frontend
  useEffect(() => {
    if (!tokens) return;

    userService
      .verify(tokens.access)
      .catch((error) => {
        if (error instanceof UserServiceError) {
          toast.error(error.message);
        }
        logout();
      })
      .finally(() => setIsVerifying(false));
  }, []);

  function login(tokens: LoginUserResponse) {
    setTokens(tokens);
    localStorage.setItem(AppConstants.STORAGE_KEY, JSON.stringify(tokens));
  }

  function logout() {
    setTokens(null);
    sessionCorrupted.current = false;
    localStorage.removeItem(AppConstants.STORAGE_KEY);
  }

  return (
    <AuthContext.Provider
      value={{ tokens, isAuthenticated, isVerifying, login, logout }}
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
