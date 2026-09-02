import { useMutation } from "@tanstack/react-query";

import { authStore } from "@/app/container";
import { useAuth } from "@/contexts/useAuth";
import { parseJwt } from "@/shared/auth/jwt";

import type { LoginFormValues } from "../types/authSchemas";

// Decode do token recebido do backend e atualiza o contexto de autenticação.
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
