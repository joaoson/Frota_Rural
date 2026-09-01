import { useMutation, useQuery } from "@tanstack/react-query";

import { userStore } from "@/app/container";

import type { User } from "../types/user";
import type { CreateUserPayload } from "../api/userMapper";

export function useUsers() {
  return useQuery(userStore.listOptions());
}

export function useUser(id: string | null) {
  return useQuery({
    ...userStore.detailOptions(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useCreateUser() {
  return useMutation<User, Error, CreateUserPayload>({
    mutationFn: (payload) => userStore.create(payload),
    onSuccess: () => {
      void userStore.invalidateLists();
    },
  });
}
