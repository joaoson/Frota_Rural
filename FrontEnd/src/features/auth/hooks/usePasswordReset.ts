import { useMutation } from "@tanstack/react-query";

import { authStore } from "@/app/container";

export function useRequestPasswordReset() {
  return useMutation<string, Error, string>({
    mutationFn: (email) => authStore.requestPasswordReset(email),
  });
}

export interface ConfirmResetInput {
  token: string;
  newPassword: string;
}

export function useConfirmPasswordReset() {
  return useMutation<void, Error, ConfirmResetInput>({
    mutationFn: ({ token, newPassword }) => authStore.confirmPasswordReset(token, newPassword),
  });
}
