import { useMutation } from "@tanstack/react-query";

import { authStore } from "@/app/container";
import { useAuth } from "@/contexts/AuthContext";
import { parseJwt } from "@/shared/auth/jwt";

import type { LoginFormValues } from "../types/authSchemas";

/**
 * O papel do usuário vem da claim `role` do próprio access token.
 *
 * A versão anterior fazia um `GET /users/{id}` extra só para descobrir isso,
 * com um fallback silencioso quando a chamada falhava. Uma requisição a menos e
 * sem caminho degradado.
 */
export function useLogin() {
  const { login } = useAuth();

  return useMutation<string, Error, LoginFormValues>({
    mutationFn: ({ email, password }) => authStore.login(email, password),
    onSuccess: (access) => {
      const payload = parseJwt(access);
      login({ access }, payload?.role ?? null);
    },
  });
}
