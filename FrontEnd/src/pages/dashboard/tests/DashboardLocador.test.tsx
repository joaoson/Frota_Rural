import { type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardLocador from "../DashboardLocador";

const mocks = vi.hoisted(() => ({ record: vi.fn(), complete: vi.fn(), review: vi.fn(), cancel: vi.fn(), postings: vi.fn(), machines: [] as object[], rentals: [] as object[], reviews: [] as object[], given: [] as object[] }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a", logout: vi.fn() }) }));
vi.mock("@/features/users/hooks/useUsers", () => ({ useUser: () => ({ data: { id: "owner-a", name: "João", role: "locador" } }) }));
vi.mock("@/features/machines/hooks/useMachines", () => ({ useMachines: () => ({ data: mocks.machines }) }));
vi.mock("@/features/machines/hooks/useUpdateMachine", () => ({ useUpdateMachine: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/features/postings/hooks/usePostings", () => ({ usePostings: (...args: unknown[]) => { mocks.postings(...args); return { data: [] }; } }));
vi.mock("@/features/contracts/hooks/useContracts", () => ({ useRentalsAsLessor: () => ({ data: mocks.rentals }), useCancelRental: () => ({ mutateAsync: mocks.cancel }), useRecordMeterReading: () => ({ mutateAsync: mocks.record, isPending: false }), useCompleteRental: () => ({ mutateAsync: mocks.complete, isPending: false }), useMachineUsage: () => ({ data: undefined }) }));
vi.mock("@/features/reviews/hooks/useReviews", () => ({ useCreateReview: () => ({ mutateAsync: mocks.review }), useReceivedReviews: () => ({ data: mocks.reviews }), useWrittenReviews: () => ({ data: mocks.given }) }));
vi.mock("@/features/documents/hooks/useDocuments", () => ({ useCertifications: () => ({ data: [] }), useOperatorLicenses: () => ({ data: [] }) }));
vi.mock("@/app/container", () => ({ documentStore: {} }));
vi.mock("@/components/EditEquipamentoModal", () => ({ default: () => null }));
vi.mock("@/components/AssinaturaContratoModal", () => ({ default: () => null }));
vi.mock("@/features/dashboard/components/DashboardShell", () => ({ DashboardShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/dashboard/components/AccountSection", () => ({ AccountSection: () => null }));
vi.mock("@/features/chat/components/ChatInboxPanel", () => ({ default: () => null }));
vi.mock("@/features/notifications/components/NotificationsPanel", () => ({ NotificationsPanel: () => null }));
vi.mock("recharts", () => ({ ResponsiveContainer: () => null, Area: () => null, AreaChart: () => null, Bar: () => null, BarChart: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));

const rental = { id: "rental-a", lesseeId: "tenant-a", lesseeName: "Maria", machineBrand: "John Deere", machineModel: "S790", totalPrice: 1200, startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 2), createdAt: new Date(2026, 7, 30), status: "completed", contractId: null, contractNumber: null, contractStatus: null, acceptedByLessor: false, acceptedByLessee: false };
function open(tab: string) { render(<MemoryRouter initialEntries={[`/dashboard?tab=${tab}`]}><DashboardLocador /></MemoryRouter>); }
beforeEach(() => { localStorage.clear(); mocks.review.mockReset().mockResolvedValue(undefined); mocks.postings.mockClear(); mocks.rentals = [rental]; mocks.reviews = []; mocks.given = []; mocks.machines = [{ id: "machine-a", brand: "John Deere", model: "S790", year: 2020, status: "active" }, { id: "machine-b", brand: "Case", model: "Magnum", year: 2024, status: "maintenance" }]; });
afterEach(cleanup);

it("submits the selected rental and its tenant, then prevents duplicate reviews", async () => {
  open("reservas");
  fireEvent.click(screen.getByRole("button", { name: /Avaliar Locatário/ }));
  fireEvent.change(screen.getByPlaceholderText("Conte como foi a experiência..."), { target: { value: "Ótima experiência" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar Avaliação" }));
  await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({ reviewer: "owner-a", reviewee: "tenant-a", rental: "rental-a", rating: 5, comment: "Ótima experiência" }));
  cleanup(); mocks.given = [{ rentalId: "rental-a" }]; open("reservas");
  expect(screen.queryByRole("button", { name: /Avaliar Locatário/ })).toBeNull();
});
it("filters fleet by actual machine year and text", () => {
  open("frota");
  fireEvent.change(screen.getByPlaceholderText("Buscar por marca, modelo ou registro..."), { target: { value: "case" } });
  expect(screen.queryByText("John Deere S790")).toBeNull();
  expect(screen.getByText("Case Magnum")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Buscar por marca, modelo ou registro..."), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Ano" }), { target: { value: "2020" } });
  expect(screen.getByText("John Deere S790")).toBeTruthy(); expect(screen.queryByText("Case Magnum")).toBeNull();
});
it("shows real contract counts and review average instead of sample metrics", () => {
  mocks.reviews = [{ rating: 2, createdAt: new Date() }, { rating: 4, createdAt: new Date() }];
  open("dashboard");
  expect(within(screen.getByText("CONTRATOS").parentElement!.parentElement!).getByText("0")).toBeTruthy();
  expect(screen.getByText("3,0")).toBeTruthy();
  expect(screen.queryByText("R$ 38.400")).toBeNull();
  expect(mocks.postings).toHaveBeenCalledWith({ ownerId: "owner-a" });
});
it("filters contracts by actual signatures and excludes rentals without a contract", () => {
  mocks.rentals = [rental,
    { ...rental, id: "pending", machineModel: "Pendente", status: "active", contractId: "doc-a", contractNumber: "CTR-A", acceptedByLessee: true },
    { ...rental, id: "signed", machineModel: "Assinado", status: "active", contractId: "doc-b", contractNumber: "CTR-B", acceptedByLessee: true, acceptedByLessor: true },
  ];
  open("contratos");
  fireEvent.click(screen.getByRole("button", { name: "Pendentes" }));
  expect(screen.getByRole("heading", { name: "CTR-A — John Deere Pendente" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "CTR-B — John Deere Assinado" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Assinados" }));
  expect(screen.getByRole("heading", { name: "CTR-B — John Deere Assinado" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "CTR-A — John Deere Pendente" })).toBeNull();
});

it("paginates the fleet and keeps the chosen view when filtering", () => {
  mocks.machines = Array.from({ length: 13 }, (_, index) => ({ id: `machine-${index}`, brand: "Trator", model: `Modelo ${index}`, year: 2024, status: "active" }));
  open("frota");
  expect(screen.getAllByRole("button", { name: /Editar/ })).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.getByText("Trator Modelo 6")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Lista" }));
  fireEvent.change(screen.getByLabelText("Itens por página"), { target: { value: "12" } });
  expect(screen.getAllByRole("button", { name: /Editar/ })).toHaveLength(12);
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  fireEvent.change(screen.getByPlaceholderText("Buscar por marca, modelo ou registro..."), { target: { value: "Modelo 0" } });
  expect(screen.getByText("1–1 de 1 item")).toBeTruthy();
  expect(screen.getByText("Trator Modelo 0")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lista" }).getAttribute("aria-pressed")).toBe("true");
});

it("opens an owner rental deep link on its containing page", () => {
  mocks.rentals = Array.from({ length: 14 }, (_, index) => ({ ...rental, id: `rental-${index}`, machineModel: `Modelo ${index}` }));
  render(<MemoryRouter initialEntries={["/dashboard?tab=reservas#locacao-rental-13"]}><DashboardLocador /></MemoryRouter>);
  expect(screen.getByText("John Deere Modelo 13")).toBeTruthy();
  expect(screen.getByText("13–14 de 14 itens")).toBeTruthy();
  expect(screen.queryByText("John Deere Modelo 0")).toBeNull();
});

it("counts open rentals with the same lifecycle meaning as the tenant", () => {
  mocks.rentals = [rental, { ...rental, id: "unpaid", status: "pending" }, { ...rental, id: "paid", status: "active" },
    { ...rental, id: "in-use", status: "signed", phase: "em_uso" }, { ...rental, id: "gone", status: "cancelled" }];
  open("dashboard");
  expect(within(screen.getByText("LOCAÇÕES EM ABERTO").parentElement!.parentElement!).getByText("3")).toBeTruthy();
});
