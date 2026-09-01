import { useMutation, useQuery } from "@tanstack/react-query";

import { userStore } from "@/app/container";

import type { User } from "../types/user";
import type { CreateUserPayload } from "../api/userMapper";
import type { UpdateProfileInput } from "../api/UserRepository";

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

export interface UpdateProfileVariables {
  id: string;
  input: UpdateProfileInput;
}

export function useUpdateProfile() {
  return useMutation<User, Error, UpdateProfileVariables>({
    mutationFn: ({ id, input }) => userStore.updateProfile(id, input),
    onSuccess: (_user, { id }) => {
      void userStore.invalidateDetail(id);
      void userStore.invalidateLists();
    },
  });
}

export interface ChangePasswordVariables {
  id: string;
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation<void, Error, ChangePasswordVariables>({
    mutationFn: ({ id, currentPassword, newPassword }) =>
      userStore.changePassword(id, currentPassword, newPassword),
  });
}
