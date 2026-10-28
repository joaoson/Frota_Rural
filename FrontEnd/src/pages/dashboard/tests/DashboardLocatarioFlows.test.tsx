import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardLocatario from "../DashboardLocatario";
import { ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { rentalDto, userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ role: "locatario", logout: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "tenant-a", userRole: ui.role, logout: ui.logout }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "BarChart", "Bar", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, () => null])));
vi.mock("@/components/NotificationPopover", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/DashboardMachineSearch", () => ({ default: () => <p>Busca de máquinas</p> }));
vi.mock("@/features/chat/components/ChatInboxPanel", () => ({ default: ({ subtitle }: { subtitle: string }) => <p>Chat: {subtitle}</p> }));
vi.mock("@/features/notifications/components/NotificationsPanel", () => ({ NotificationsPanel: () => <p>Painel de notificações</p> }));
vi.mock("@/features/dashboard/components/AccountSection", () => ({ AccountSection: ({ roleLabel }: { roleLabel: string }) => <p>Conta de {roleLabel}</p> }));
vi.mock("@/features/contracts/components/ContractAmendmentsPanel", () => ({ ContractAmendmentsDialog: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Alterar datas"><button onClick={onClose}>Fechar alteração</button></div> }));
vi.mock("@/features/contracts/components/RentalRecurrenceDialog", () => ({ RentalRecurrenceDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => open ? <div role="dialog" aria-label="Recorrência"><button onClick={() => onOpenChange(false)}>Fechar recorrência</button></div> : null }));
vi.mock("@/components/AssinaturaContratoModal", () => ({ default: (props: { open: boolean; contratoId: string; onAssinado: () => void; onOpenChange: (open: boolean) => void }) => props.open
  ? <div role="dialog" aria-label="Assinar contrato">{props.contratoId}<button onClick={props.onAssinado}>Concluir assinatura</button><button onClick={() => props.onOpenChange(false)}>Fechar assinatura</button></div> : null }));

const rentals = [
  rentalDto({ id: "r-pay", status: "awaiting_payment", allowed_actions: ["pay", "cancel"], lessor_name: "João Souza", machine_model: "S700", start_date: "2026-11-01T08:00:00Z", end_date: "2026-11-02T18:00:00Z" }),
  rentalDto({ id: "r-sign", status: "active", allowed_actions: ["sign", "cancel", "amend"], lessor_name: "Ana Reis", machine_model: "S780", contract_id: "c-sign", contract_number: "FR-SIGN", accepted_by_lessor: true, accepted_by_lessee: false, start_date: "2026-10-05T08:00:00Z", end_date: "2026-10-06T18:00:00Z", recurrence_index: 2 }),
  rentalDto({ id: "r-done", status: "completed", allowed_actions: ["review"], lessor_name: "Rita Alves", lessor_id: "owner-r", contract_id: "c-done", contract_number: "FR-DONE", accepted_by_lessor: true, accepted_by_lessee: true, created_at: "2025-09-01T15:00:00Z", start_date: "2025-09-01T08:00:00Z", end_date: "2025-09-02T18:00:00Z" }),
  rentalDto({ id: "r-orphan", status: "completed", allowed_actions: ["review"], lessor_name: null, lessor_id: null, machine_brand: null, machine_model: null, start_date: "2025-08-01T08:00:00Z", end_date: "2025-08-01T18:00:00Z" }),
];
function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET users/tenant-a": () => userDto({ id: "tenant-a", name: "Maria Clara Silva" }),
    "GET rentals": () => rentals,
    "GET reviews": () => [{ id: "rv", rental: "x", reviewer: "o", reviewee: "tenant-a", rating: 4, created_at: "2026-10-01T00:00:00Z" }],
    ...routes,
  });
}
const open = (tab: string) => renderWithProviders(<DashboardLocatario />, { queryClient: net.queryClient, route: `/dashboard-locatario?tab=${tab}`, path: "/dashboard-locatario" });
const card = (text: string) => screen.getByText(text).closest("[id^='locacao-']") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  ui.role = "locatario"; localStorage.clear(); net.http.send.mockReset(); net.queryClient.clear(); ui.logout.mockReset(); Object.values(ui.toast).forEach(fn => fn.mockReset());
});
afterEach(() => { vi.useRealTimers(); });

it("summarises the tenant's rentals and links each to its card", async () => {
  api(); const { user } = open("dashboard");
  expect(await screen.findByRole("heading", { name: "Bom dia, Maria" })).toBeInTheDocument();
  expect(screen.getByText("Maria Silva")).toBeInTheDocument();
  expect(within(screen.getByText("LOCAÇÕES TOTAIS").parentElement!.parentElement!).getByText("4")).toBeInTheDocument();
  expect(screen.getAllByRole("link").some(link => link.getAttribute("href") === "/dashboard-locatario?tab=locacoes#locacao-r-sign")).toBe(true);
  await user.click(screen.getByRole("button", { name: /Ver todas/ }));
  expect(await screen.findByText("Ana Reis")).toBeInTheDocument();
});

it("retries loading rentals after a failure", async () => {
  api({ "GET rentals": () => { throw new ServerError(500); } });
  const { user } = open("locacoes");
  const alert = await screen.findByRole("alert");
  api();
  await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Ana Reis")).toBeInTheDocument();
});

it("offers payment, recurrence and date changes on open rentals", async () => {
  api(); const { user } = open("locacoes");
  const unpaid = await screen.findByText("João Souza").then(() => card("João Souza"));
  expect(within(unpaid).getByRole("button", { name: "Pagar reserva" })).toBeInTheDocument();
  const signing = card("Ana Reis");
  expect(within(signing).getByText("Reserva recorrente · Ocorrência 2")).toBeInTheDocument();
  await user.click(within(signing).getByRole("button", { name: "Alterar datas" }));
  await user.click(screen.getByRole("button", { name: "Fechar alteração" }));
  await user.click(within(signing).getByRole("button", { name: /Programar recorrência/ }));
  expect(screen.getByRole("dialog", { name: "Recorrência" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Fechar recorrência" }));
  expect(screen.queryByRole("dialog", { name: "Recorrência" })).not.toBeInTheDocument();
  expect(within(signing).getByRole("link", { name: /Analisar/ })).toHaveAttribute("href", "/dashboard-locatario/locacoes/r-sign");
});

it.each([
  [() => ({ ...rentals[0], status: "cancelled" }), "success", "Reserva cancelada. As datas foram liberadas."],
  [() => { throw new ConflictError("Prazo de cancelamento encerrado."); }, "error", "Prazo de cancelamento encerrado."],
  [() => { throw "boom"; }, "error", "Não foi possível cancelar a reserva."],
] as const)("cancels an unpaid reservation (%#)", async (cancel, level, message) => {
  api({
    "GET rentals/r-pay/cancellation": () => ({ allowed: true, refund_amount: "0", retained_amount: "0", reason_code: "x", policy_text: "Sem cobrança.", policy_version: "1" }),
    "POST rentals/r-pay/cancel": cancel,
  });
  const { user } = open("locacoes");
  const unpaid = await screen.findByText("João Souza").then(() => card("João Souza"));
  await user.click(within(unpaid).getByRole("button", { name: "Cancelar reserva" }));
  await within(unpaid).findByText("Sem cobrança.");
  await user.click(within(unpaid).getByRole("button", { name: "Confirmar cancelamento" }));
  await vi.waitFor(() => expect(ui.toast[level]).toHaveBeenCalledWith(message));
});

it("reviews a finished rental and refuses rentals without a known owner", async () => {
  api({ "POST reviews": () => ({ id: "new", rental: "r-done", reviewer: "tenant-a", reviewee: "owner-r", rating: 4 }) });
  const { user } = open("locacoes");
  const done = await screen.findByText("Rita Alves").then(() => card("Rita Alves"));
  await user.click(within(done).getByRole("button", { name: /Avaliar$/ }));
  await user.click(within(done).getByRole("button", { name: "Enviar Avaliação" }));
  expect(ui.toast.error).toHaveBeenCalledWith("Por favor, escreva um comentário.");
  await user.type(within(done).getByPlaceholderText("Conte como foi a experiência..."), "Máquina impecável.");
  await user.click(within(done).getByRole("button", { name: "Enviar Avaliação" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Avaliação enviada com sucesso!"));
  const orphan = document.getElementById("locacao-r-orphan")!;
  await user.click(within(orphan).getByRole("button", { name: /Avaliar$/ }));
  await user.click(within(orphan).getByRole("button", { name: "Enviar Avaliação" }));
  expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível avaliar esta locação. Atualize a página e tente novamente.");
  await user.click(within(orphan).getByRole("button", { name: /Ver Detalhes/ }));
  expect(within(orphan).getByText("Detalhes da Locação")).toBeInTheDocument();
});

it("reports a refused review", async () => {
  api({ "POST reviews": () => { throw new ConflictError("Já avaliada."); } });
  const { user } = open("locacoes");
  const done = await screen.findByText("Rita Alves").then(() => card("Rita Alves"));
  await user.click(within(done).getByRole("button", { name: /Avaliar$/ }));
  await user.type(within(done).getByPlaceholderText("Conte como foi a experiência..."), "Boa.");
  await user.click(within(done).getByRole("button", { name: "Enviar Avaliação" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Já avaliada."));
});

it("lists contracts with their signature state and opens signing", async () => {
  api(); const { user } = open("contratos");
  const pending = await screen.findByRole("heading", { name: "FR-SIGN — John Deere S780" });
  expect(pending.closest("div.rounded-2xl")).toHaveTextContent("Assinatura Pendente");
  expect(screen.getByRole("heading", { name: "FR-DONE — John Deere S790" }).closest("div.rounded-2xl")).toHaveTextContent("Encerrado");
  expect(screen.getByRole("heading", { name: "FR-DONE — John Deere S790" }).closest("div.rounded-2xl")).toHaveTextContent("Criado em 01/09/2025");
  expect(screen.getAllByRole("link", { name: /Imprimir/ })[0]).toHaveAttribute("href", expect.stringContaining("?print=1"));
  await user.click(screen.getByRole("button", { name: /Assinar Contrato/ }));
  expect(screen.getByRole("dialog", { name: "Assinar contrato" })).toHaveTextContent("r-sign");
  await user.click(screen.getByRole("button", { name: "Concluir assinatura" }));
  await user.click(screen.getByRole("button", { name: "Fechar assinatura" }));
  expect(screen.queryByRole("dialog", { name: "Assinar contrato" })).not.toBeInTheDocument();
});

it.each([["buscar", "Busca de máquinas"], ["chat", "Chat: Converse com seus locadores"], ["notificacoes", "Painel de notificações"], ["conta", "Conta de Locatário"], ["avaliacoes", "Avaliações Recebidas"]])(
  "shows the %s tab", async (tab, text) => {
    api(); open(tab);
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  },
);

it("does not offer the operators team to tenants", async () => {
  api(); open("operadores");
  expect(await screen.findByRole("button", { name: /Minhas Locações/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Operadores/ })).not.toBeInTheDocument();
});

it("limits operators to chat, notifications and account", async () => {
  ui.role = "operador"; api();
  const { user } = open("locacoes");
  expect(await screen.findByText("Conta de Operador")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Locações/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Chat/ }));
  expect(await screen.findByText("Chat: Converse sobre seus serviços")).toBeInTheDocument();
  expect(net.http.send.mock.calls.some(([request]) => request.path === "rentals")).toBe(false);
});
