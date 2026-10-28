/**
 * Substituto de `@/app/container` para testes de integração:
 * stores e repositórios reais, só a rede é falsa.
 *
 *   vi.mock("@/app/container", () => import("@/test/container"));
 *   import { net } from "@/test/container";
 *   net.http.send.mockResolvedValue(ok(...));
 */
import { HttpNotificationRepository } from "@/features/notifications/api/NotificationRepository";
import { NotificationStore } from "@/features/notifications/api/NotificationStore";
import { HttpPricingRepository } from "@/features/pricing/api/PricingRepository";
import { PricingStore } from "@/features/pricing/api/PricingStore";
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
import { HttpChatRepository } from "@/features/chat/api/ChatRepository";
import { ChatStore } from "@/features/chat/api/ChatStore";
import { HttpOperatorRepository } from "@/features/operators/api/OperatorRepository";
import { OperatorStore } from "@/features/operators/api/OperatorStore";
import { HttpPaymentRepository } from "@/features/payments/api/PaymentRepository";
import { PaymentStore } from "@/features/payments/api/PaymentStore";
import { HttpPostingRepository } from "@/features/postings/api/PostingRepository";
import { PostingStore } from "@/features/postings/api/PostingStore";
import { HttpUserRepository } from "@/features/users/api/UserRepository";
import { UserStore } from "@/features/users/api/UserStore";
import { MachineStore } from "@/features/machines/api/MachineStore";
import { HttpDashboardRepository } from "@/features/dashboard/api/DashboardRepository";
import { DashboardStore } from "@/features/dashboard/api/DashboardStore";
import { InMemoryTokenStore } from "@/shared/auth/InMemoryTokenStore";
import { SessionService } from "@/shared/auth/SessionService";
import { ViaCepClient } from "@/shared/http/ViaCepClient";

import { fakeHttp } from "./http";
import { createTestQueryClient } from "./render";

const httpClient = fakeHttp();
export const queryClient = createTestQueryClient();
export const net = { http: httpClient, queryClient };

export const tokenStore = new InMemoryTokenStore();
export const sessionService = new SessionService(httpClient, tokenStore);
export const viaCepClient = new ViaCepClient(httpClient);
export const authStore = new AuthStore(new HttpAuthRepository(httpClient), tokenStore, queryClient);

const stores = {
  dashboard: new DashboardStore(new HttpDashboardRepository(httpClient), queryClient),
  notifications: new NotificationStore(new HttpNotificationRepository(httpClient), queryClient),
  pricing: new PricingStore(new HttpPricingRepository(httpClient)),
  machines: new MachineStore(new HttpMachineRepository(httpClient), queryClient),
  users: new UserStore(new HttpUserRepository(httpClient), queryClient),
  postings: new PostingStore(new HttpPostingRepository(httpClient), queryClient),
  payments: new PaymentStore(new HttpPaymentRepository(httpClient), queryClient),
  operators: new OperatorStore(new HttpOperatorRepository(httpClient), queryClient),
  chat: new ChatStore(new HttpChatRepository(httpClient), queryClient),
  moderation: new ModerationStore(new HttpModerationRepository(httpClient), queryClient),
  documents: new DocumentStore(new HttpDocumentRepository(httpClient), queryClient),
  contracts: new ContractStore(new HttpContractRepository(httpClient), queryClient),
  reviews: new ReviewStore(new HttpReviewRepository(httpClient), queryClient),
} as const;

export const {
  dashboard: dashboardStore,
  notifications: notificationStore,
  pricing: pricingStore,
  machines: machineStore,
  users: userStore,
  postings: postingStore,
  payments: paymentStore,
  operators: operatorStore,
  chat: chatStore,
  moderation: moderationStore,
  documents: documentStore,
  contracts: contractStore,
  reviews: reviewStore,
} = stores;

export function clearAllStores(): void {
  Object.values(stores).forEach((store) => store.clear());
}
