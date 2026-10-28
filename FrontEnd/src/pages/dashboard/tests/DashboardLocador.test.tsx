import { type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardLocador from "../DashboardLocador";
import { formatCurrency } from "@/features/dashboard/utils/ownerSummary";

const mocks = vi.hoisted(() => ({ record: vi.fn(), complete: vi.fn(), review: vi.fn(), cancel: vi.fn(), postings: vi.fn(), summaryArgs: vi.fn(), machines: [] as object[], postingsData: [] as object[], rentals: [] as object[], reviews: [] as object[], given: [] as object[], summary: undefined as object | undefined, fetching: false }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a", logout: vi.fn() }) }));
vi.mock("@/features/users/hooks/useUsers", () => ({ useUser: () => ({ data: { id: "owner-a", name: "João", role: "locador" } }) }));
vi.mock("@/features/machines/hooks/useMachines", () => ({ useMachines: () => ({ data: mocks.machines, isSuccess: true }) }));
vi.mock("@/features/machines/hooks/useUpdateMachine", () => ({ useUpdateMachine: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/features/postings/hooks/usePostings", () => ({ usePostings: (...args: unknown[]) => { mocks.postings(...args); return { data: mocks.postingsData }; } }));
vi.mock("@/features/contracts/hooks/useContracts", () => ({ useRentalsAsLessor: () => ({ data: mocks.rentals }), useCancelRental: () => ({ mutateAsync: mocks.cancel }), useRecordMeterReading: () => ({ mutateAsync: mocks.record, isPending: false }), useCompleteRental: () => ({ mutateAsync: mocks.complete, isPending: false }), useMachineUsage: () => ({ data: undefined }) }));
vi.mock("@/features/reviews/hooks/useReviews", () => ({ useCreateReview: () => ({ mutateAsync: mocks.review }), useReceivedReviews: () => ({ data: mocks.reviews }), useWrittenReviews: () => ({ data: mocks.given }) }));
vi.mock("@/features/dashboard/hooks/useLessorDashboard", () => ({ browserTimeZone: () => "America/Sao_Paulo", useLessorDashboard: (...args: unknown[]) => { mocks.summaryArgs(...args); return { data: mocks.summary, isFetching: mocks.fetching, isError: false, isLoading: false, refetch: vi.fn() }; } }));
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
const summary = (overrides: Record<string, unknown> = {}) => ({ months: 6, machineId: null, monthly: [], statusBreakdown: [{ status: "completed", label: "Concluída", total: 1 }], topMachines: [], ...overrides,
  totals: { revenue: 1200, currentMonthRevenue: 0, completedRentals: 1, reviews: 0, averageRating: null, openRentals: 0, rentals: 1, ...(overrides.totals as object) } });
// formatCurrency usa espaço não separável; o Testing Library normaliza o texto do DOM.
const money = (value: number) => formatCurrency(value).replace(/\s/g, " ");
const lastSummaryFilter = () => mocks.summaryArgs.mock.calls.at(-1)![0] as { months: number; machineId?: string; timeZone: string };
function open(tab: string) { render(<MemoryRouter initialEntries={[`/dashboard?tab=${tab}`]}><DashboardLocador /></MemoryRouter>); }
beforeEach(() => { localStorage.clear(); mocks.review.mockReset().mockResolvedValue(undefined); mocks.postings.mockClear(); mocks.summaryArgs.mockClear(); mocks.summary = summary(); mocks.fetching = false; mocks.postingsData = []; mocks.rentals = [rental]; mocks.reviews = []; mocks.given = []; mocks.machines = [{ id: "machine-a", brand: "John Deere", model: "S790", year: 2020, status: "active" }, { id: "machine-b", brand: "Case", model: "Magnum", year: 2024, status: "maintenance" }]; });
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
  mocks.summary = summary({ totals: { averageRating: 3, reviews: 2 } });
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

it("shows indicators, ranking and status breakdown aggregated by the server", () => {
  mocks.summary = summary({
    months: 3,
    totals: { revenue: 650, currentMonthRevenue: 550, openRentals: 3, rentals: 8 },
    statusBreakdown: [{ status: "pending", label: "Pendente", total: 1 }, { status: "cancelled", label: "Cancelada", total: 1 }],
    topMachines: [{ machineId: "machine-a", name: "John Deere S790", completedRentals: 2, revenue: 400 },
      { machineId: "machine-b", name: "Case Magnum", completedRentals: 1, revenue: 250 }],
  });
  open("dashboard");
  const card = (label: string) => within(screen.getByText(label).parentElement!.parentElement!);
  expect(card("LOCAÇÕES EM ABERTO").getByText("3")).toBeTruthy();
  expect(card("LOCAÇÕES TOTAIS").getByText("8")).toBeTruthy();
  expect(card("LOCAÇÕES CONCLUÍDAS NO MÊS").getByText(money(550))).toBeTruthy();
  expect(screen.getByText(money(650))).toBeTruthy();
  expect(screen.getByText(/Últimos 3 meses · valor bruto/)).toBeTruthy();
  expect(screen.getByText("1. John Deere S790")).toBeTruthy();
  expect(screen.getByText("2 locações concluídas")).toBeTruthy();
  expect(screen.getByText("1 locação concluída")).toBeTruthy();
  expect(screen.getByText("Pendente: 1")).toBeTruthy();
  expect(screen.getByText("Cancelada: 1")).toBeTruthy();
});

it("sends the period and machine filters to the server and keeps them after reload", () => {
  open("dashboard");
  expect(mocks.summaryArgs).toHaveBeenLastCalledWith({ months: 6, machineId: undefined, timeZone: "America/Sao_Paulo" }, true);
  fireEvent.change(screen.getByLabelText("Período"), { target: { value: "12" } });
  expect(lastSummaryFilter().months).toBe(12);
  fireEvent.change(screen.getByLabelText("Máquina"), { target: { value: "machine-b" } });
  expect(lastSummaryFilter()).toEqual({ months: 12, machineId: "machine-b", timeZone: "America/Sao_Paulo" });
  cleanup(); open("dashboard");
  expect((screen.getByLabelText("Período") as HTMLSelectElement).value).toBe("12");
  expect((screen.getByLabelText("Máquina") as HTMLSelectElement).value).toBe("machine-b");
  expect(lastSummaryFilter().machineId).toBe("machine-b");
});

it("drops a saved machine that left the fleet and scopes contracts to the chosen machine", () => {
  localStorage.setItem("frota:dashboard:v1:owner-a:owner:overview", JSON.stringify({ months: 3, machine: "sold-machine" }));
  mocks.postingsData = [{ id: "posting-a", machineryId: "machine-a" }, { id: "posting-b", machineryId: "machine-b" }];
  mocks.rentals = [
    { ...rental, id: "contract-a", postingId: "posting-a", status: "active", contractId: "doc-a", contractNumber: "CTR-A" },
    { ...rental, id: "contract-b", postingId: "posting-b", status: "active", contractId: "doc-b", contractNumber: "CTR-B" },
  ];
  open("dashboard");
  expect(lastSummaryFilter()).toEqual({ months: 3, machineId: undefined, timeZone: "America/Sao_Paulo" });
  expect((screen.getByLabelText("Máquina") as HTMLSelectElement).value).toBe("");
  const contracts = () => within(screen.getByText("CONTRATOS").parentElement!.parentElement!);
  expect(contracts().getByText("2")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Máquina"), { target: { value: "machine-a" } });
  expect(contracts().getByText("1")).toBeTruthy();
});

it("waits for the server summary and signals a refresh without hiding the charts", () => {
  mocks.summary = undefined;
  open("dashboard");
  expect(screen.queryByText("LOCAÇÕES EM ABERTO")).toBeNull();
  cleanup(); mocks.summary = summary(); mocks.fetching = true; open("dashboard");
  expect(screen.getByText("Atualizando indicadores...").getAttribute("role")).toBe("status");
  expect(screen.getByText("Nenhuma locação concluída no período.")).toBeTruthy();
});
