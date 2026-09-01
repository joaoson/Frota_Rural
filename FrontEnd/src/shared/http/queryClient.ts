import { QueryClient } from "@tanstack/react-query";

import { HttpError } from "./errors";

/**
 * Configuração do cache de estado de servidor.
 *
 * O `retry` conhece a hierarquia de erros: repetir um 400 ou um 404 não muda o
 * resultado e só atrasa o feedback ao usuário.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof HttpError && error.status !== undefined) {
            if (error.status >= 400 && error.status < 500) return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
