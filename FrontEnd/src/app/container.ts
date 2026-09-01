import { HttpMachineRepository } from "@/features/machines/api/MachineRepository";
import { MachineStore } from "@/features/machines/api/MachineStore";
import { InMemoryTokenStore } from "@/shared/auth/InMemoryTokenStore";
import { SessionService } from "@/shared/auth/SessionService";
import { AxiosHttpClient, createAxiosInstance } from "@/shared/http/AxiosHttpClient";
import type { HttpClient } from "@/shared/http/HttpClient";
import { AuthenticatedHttpClient } from "@/shared/http/decorators/AuthenticatedHttpClient";
import { LoggingHttpClient } from "@/shared/http/decorators/LoggingHttpClient";
import { RefreshingHttpClient } from "@/shared/http/decorators/RefreshingHttpClient";
import { createQueryClient } from "@/shared/http/queryClient";

/**
 * Composition root.
 *
 * Único módulo autorizado a instanciar adapters concretos. Todo o resto recebe
 * abstrações por construtor — é isso que torna a inversão de dependência real e
 * não apenas nominal.
 *
 * Ordem da cadeia, de dentro para fora:
 *
 *   AxiosHttpClient          transporte
 *   └ AuthenticatedHttpClient  injeta Authorization
 *     └ RefreshingHttpClient     renova em 401 e repete
 *       └ LoggingHttpClient        só em desenvolvimento
 *
 * Authenticated fica DENTRO de Refreshing de propósito: a repetição pós-refresh
 * volta a passar pelo header e pega o token novo sozinha.
 */

const axiosInstance = createAxiosInstance();

/** Cliente cru, sem decorators. */
const rawHttpClient = new AxiosHttpClient(axiosInstance);

export const tokenStore = new InMemoryTokenStore();

/**
 * O SessionService usa o cliente CRU. Se usasse a cadeia decorada, um 401 no
 * próprio refresh dispararia outro refresh.
 */
const sessionService = new SessionService(rawHttpClient, tokenStore);

const decoratedHttpClient: HttpClient = new RefreshingHttpClient(
  new AuthenticatedHttpClient(rawHttpClient, tokenStore),
  sessionService,
);

export const httpClient: HttpClient = import.meta.env.DEV
  ? new LoggingHttpClient(decoratedHttpClient)
  : decoratedHttpClient;

export const queryClient = createQueryClient();

const machineRepository = new HttpMachineRepository(httpClient);

export const machineStore = new MachineStore(machineRepository, queryClient);

/** Limpa todo estado de servidor em memória. Chamado no logout. */
export function clearAllStores(): void {
  machineStore.clear();
}
