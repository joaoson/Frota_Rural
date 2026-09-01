import { useMutation, useQuery } from "@tanstack/react-query";

import { postingStore } from "@/app/container";

import type { PostingFilter } from "../api/PostingRepository";
import type { PostingWritePayload } from "../types/postingSchemas";

export function usePostings(filter: PostingFilter = {}) {
  return useQuery(postingStore.listOptions(filter));
}

export function usePosting(id: string | null) {
  return useQuery({
    ...postingStore.detailOptions(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useCreatePosting() {
  return useMutation<string, Error, PostingWritePayload>({
    mutationFn: (payload) => postingStore.create(payload),
    onSuccess: () => {
      void postingStore.invalidateLists();
    },
  });
}

export interface UpdatePostingInput {
  id: string;
  payload: PostingWritePayload;
}

export function useUpdatePosting() {
  return useMutation<void, Error, UpdatePostingInput>({
    mutationFn: ({ id, payload }) => postingStore.update(id, payload),
    onSuccess: (_result, { id }) => {
      void postingStore.invalidateLists();
      void postingStore.invalidateDetail(id);
    },
  });
}

export function useDeletePosting() {
  return useMutation<void, Error, string>({
    mutationFn: (id) => postingStore.remove(id),
    onSuccess: () => {
      void postingStore.invalidateLists();
    },
  });
}
