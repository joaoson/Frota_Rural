import { createContext, useContext, useEffect, useState } from "react";
import type { LoginUserResponse } from "@/services/UserService/models/LoginUserResponse";
import { userService } from "@/services/UserService/UserService";
import { toast } from "sonner";
import { UserServiceError } from "@/services/UserService/errors/UserError";

const STORAGE_KEY = "frota_rural_tokens";

type AuthContextType = {
  tokens: LoginUserResponse | null;
  isAuthenticated: boolean;
  isVerifying: boolean;
  login: (tokens: LoginUserResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<LoginUserResponse | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LoginUserResponse) : null;
    } catch {
      return null;
    }
  });

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  function logout() {
    setTokens(null);
    localStorage.removeItem(STORAGE_KEY);
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
