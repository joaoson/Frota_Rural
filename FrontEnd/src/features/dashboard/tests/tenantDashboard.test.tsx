import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardLocatario from "@/pages/dashboard/DashboardLocatario";
import { rentalToDomain } from "@/features/contracts/api/contractMapper";

const mocks = vi.hoisted(() => ({ rentals: [] as unknown[], reviews: [] as unknown[], create: vi.fn(), cancel: vi.fn(), userRole: "locatario", query: vi.fn() }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "tenant-a", userRole: mocks.userRole, logout: vi.fn() }) }));
vi.mock("@/features/users/hooks/useUsers", () => ({ useUser: () => ({ data: { name: "Maria Silva" } }) }));
vi.mock("@/features/contracts/hooks/useContracts", () => ({ useRentalsAsLessee: (id: string | null) => { mocks.query(id); return { data: mocks.rentals }; }, useCancelRental: () => ({ mutateAsync: mocks.cancel }) }));
vi.mock("@/features/reviews/hooks/useReviews", () => ({ useReceivedReviews: () => ({ data: [] }), useWrittenReviews: () => ({ data: mocks.reviews }), useCreateReview: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/features/dashboard/components/DashboardShell", () => ({ DashboardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/features/dashboard/components/AccountSection", () => ({ AccountSection: ({ roleLabel }: { roleLabel: string }) => <p>Conta: {roleLabel}</p> }));
vi.mock("@/features/dashboard/components/ReviewsSection", () => ({ ReviewsSection: () => null }));
vi.mock("@/features/notifications/components/NotificationsPanel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/features/chat/components/ChatInboxPanel", () => ({ default: () => null }));
vi.mock("@/components/DashboardMachineSearch", () => ({ default: () => null }));
vi.mock("@/components/OperadoresPanel", () => ({ default: () => null }));
vi.mock("@/components/AssinaturaContratoModal", () => ({ default: () => null }));
vi.mock("@/features/contracts/components/RentalRecurrenceDialog", () => ({ RentalRecurrenceDialog: () => null }));
vi.mock("@/features/payments/components/RentalPaymentButton", () => ({ RentalPaymentButton: () => null }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "BarChart", "Bar", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, () => null])));

const completed = rentalToDomain({ id: "rental-a", postings: "posting-a", lessee: "tenant-a", lessor_id: "owner-a", lessor_name: "João Silva", machine_brand: "John Deere", machine_model: "S790", start_date: "2026-09-01T08:00:00Z", end_date: "2026-09-02T18:00:00Z", total_price: "2000", status: "completed" });
const pending = rentalToDomain({ id: "rental-b", postings: "posting-b", lessee: "tenant-a", lessor_id: "owner-b", lessor_name: "Ana Pereira", machine_brand: "Case", machine_model: "Puma", start_date: "2026-09-25T08:00:00Z", end_date: "2026-09-26T18:00:00Z", total_price: "900", status: "pending", contract_id: "contract-b", contract_status: "pending", contract_number: "FR-B" });
beforeEach(() => { mocks.userRole = "locatario"; mocks.rentals = [completed, pending]; mocks.reviews = []; mocks.create.mockResolvedValue({}); mocks.cancel.mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = (tab: string) => render(<MemoryRouter initialEntries={[`/dashboard-locatario?tab=${tab}`]}><DashboardLocatario /></MemoryRouter>);

it("submits a review for the selected rental and its real owner", async () => {
  show("locacoes");
  fireEvent.click(screen.getByRole("button", { name: /Avaliar$/ }));
  fireEvent.change(screen.getByPlaceholderText("Conte como foi a experiência..."), { target: { value: "Máquina em boas condições." } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar Avaliação" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ reviewer: "tenant-a", reviewee: "owner-a", rental: "rental-a", rating: 5, comment: "Máquina em boas condições." }));
});
it("filters rental lists and shows no unrelated machines", () => {
  show("locacoes");
  fireEvent.change(screen.getByPlaceholderText("Buscar por locador, maquinário ou contrato..."), { target: { value: "Puma" } });
  expect(screen.queryByText("John Deere S790")).toBeNull();
  expect(screen.getByText("Case Puma")).toBeTruthy();
});
it("offers signature recovery for a pending contract and filters closed contracts", () => {
  mocks.rentals = [{ ...pending, status: "active" }];
  show("contratos");
  expect(screen.getByRole("button", { name: /Assinar Contrato/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Encerrados" }));
  expect(screen.queryByText("FR-B — Case Puma")).toBeNull();
  expect(screen.getByText("Nenhum contrato disponível.")).toBeTruthy();
});
it("uses account data instead of demo statistics", () => {
  show("dashboard");
  expect(screen.queryByText("R$ 15.000")).toBeNull();
  expect(screen.queryByText("4.3")).toBeNull();
  expect(screen.getByText("VALOR CONTRATADO NO MÊS")).toBeTruthy();
});

it("operators open their account without requesting a tenant's rental list", () => {
  mocks.userRole = "operador";
  show("locacoes");
  expect(screen.getByText("Conta: Operador")).toBeTruthy();
  expect(mocks.query).toHaveBeenCalledWith(null);
  expect(screen.queryByText("Minhas Locações")).toBeNull();
});
