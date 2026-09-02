import { HttpAuthRepository } from "@/features/auth/api/AuthRepository";
import { AuthStore } from "@/features/auth/api/AuthStore";
import { HttpContractRepository } from "@/features/contracts/api/ContractRepository";
import { ContractStore } from "@/features/contracts/api/ContractStore";
import { HttpReviewRepository } from "@/features/reviews/api/ReviewRepository";
import { ReviewStore } from "@/features/reviews/api/ReviewStore";
import { HttpDocumentRepository } from "@/features/documents/api/DocumentRepository";
import { DocumentStore } from "@/features/documents/api/DocumentStore";
import { HttpMachineRepository } from "@/features/machines/api/MachineRepository";
import { HttpModerationRepository } from "@/features/administration/api/ModerationRepository";
import { ModerationStore } from "@/features/administration/api/ModerationStore";
import { HttpPostingRepository } from "@/features/postings/api/PostingRepository";
import { PostingStore } from "@/features/postings/api/PostingStore";
import { HttpUserRepository } from "@/features/users/api/UserRepository";
import { UserStore } from "@/features/users/api/UserStore";
import { MachineStore } from "@/features/machines/api/MachineStore";
import { InMemoryTokenStore } from "@/shared/auth/InMemoryTokenStore";
import { SessionService } from "@/shared/auth/SessionService";
import { AxiosHttpClient, createAxiosInstance } from "@/shared/http/AxiosHttpClient";
import type { HttpClient } from "@/shared/http/HttpClient";
import { AuthenticatedHttpClient } from "@/shared/http/decorators/AuthenticatedHttpClient";
import { LoggingHttpClient } from "@/shared/http/decorators/LoggingHttpClient";
import { RefreshingHttpClient } from "@/shared/http/decorators/RefreshingHttpClient";
import { createQueryClient } from "@/shared/http/queryClient";
import { ViaCepClient } from "@/shared/http/ViaCepClient";

/**
 * Composition root.
 * Instancia adapters concretos. Posteriormente, acessados por exportação.
*/
const axiosInstance = createAxiosInstance();
const rawHttpClient = new AxiosHttpClient(axiosInstance);

export const tokenStore = new InMemoryTokenStore();

const sessionService = new SessionService(rawHttpClient, tokenStore);
const decoratedHttpClient: HttpClient = new RefreshingHttpClient(
  new AuthenticatedHttpClient(rawHttpClient, tokenStore),
  sessionService,
);

export const httpClient: HttpClient = import.meta.env.DEV
  ? new LoggingHttpClient(decoratedHttpClient)
  : decoratedHttpClient;

export const viaCepClient = new ViaCepClient(
  new AxiosHttpClient(createAxiosInstance("https://viacep.com.br/ws/")),
);

export const queryClient = createQueryClient();

const authRepository = new HttpAuthRepository(rawHttpClient);
export const authStore = new AuthStore(authRepository, tokenStore, queryClient);

const stores = {
  machines: new MachineStore(new HttpMachineRepository(httpClient), queryClient),
  users: new UserStore(new HttpUserRepository(httpClient), queryClient),
  postings: new PostingStore(new HttpPostingRepository(httpClient), queryClient),
  moderation: new ModerationStore(new HttpModerationRepository(httpClient), queryClient),
  documents: new DocumentStore(new HttpDocumentRepository(httpClient), queryClient),
  contracts: new ContractStore(new HttpContractRepository(httpClient), queryClient),
  reviews: new ReviewStore(new HttpReviewRepository(httpClient), queryClient),
} as const;

export const {
  machines: machineStore,
  users: userStore,
  postings: postingStore,
  moderation: moderationStore,
  documents: documentStore,
  contracts: contractStore,
  reviews: reviewStore,
} = stores;

export function clearAllStores(): void {
  machineStore.clear();
  userStore.clear();
  postingStore.clear();
  moderationStore.clear();
  documentStore.clear();
  contractStore.clear();
  reviewStore.clear();
}
