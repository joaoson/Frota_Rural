import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardLocador from "../DashboardLocador";
import { ConflictError, ServerError } from "@/shared/http/errors";
import { net } from "@/test/container";
import { machineDto, postingListDto, rentalDto, userDto } from "@/test/factories";
import { serve, type Route } from "@/test/http";
import { renderWithProviders } from "@/test/render";

const ui = vi.hoisted(() => ({ logout: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, sign: null as null | { onAssinado: () => void; open: boolean } }));
vi.mock("@/app/container", () => import("@/test/container"));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a", logout: ui.logout }) }));
vi.mock("sonner", () => ({ toast: ui.toast }));
vi.mock("recharts", () => Object.fromEntries(["AreaChart", "Area", "BarChart", "Bar", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, () => null])));
vi.mock("@/components/NotificationPopover", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/features/chat/components/ChatInboxPanel", () => ({ default: ({ subtitle }: { subtitle: string }) => <p>Chat: {subtitle}</p> }));
vi.mock("@/features/notifications/components/NotificationsPanel", () => ({ NotificationsPanel: () => <p>Painel de notificações</p> }));
vi.mock("@/features/dashboard/components/AccountSection", () => ({ AccountSection: () => <p>Seção da conta</p> }));
vi.mock("@/features/contracts/components/ContractAmendmentsPanel", () => ({ ContractAmendmentsDialog: ({ contractId, onClose }: { contractId: string; onClose: () => void }) => <div role="dialog" aria-label="Alterar datas">{contractId}<button onClick={onClose}>Fechar alteração</button></div> }));
vi.mock("@/components/AssinaturaContratoModal", () => ({ default: (props: { open: boolean; contratoId: string; onAssinado: () => void; onOpenChange: (open: boolean) => void }) => {
  ui.sign = props;
  return props.open ? <div role="dialog" aria-label="Assinar contrato">{props.contratoId}<button onClick={props.onAssinado}>Concluir assinatura</button><button onClick={() => props.onOpenChange(false)}>Fechar assinatura</button></div> : null;
} }));
vi.mock("@/components/EditEquipamentoModal", () => ({ default: (props: { open: boolean; equipamento: Record<string, string>; onSave: (data: Record<string, string>) => Promise<void> }) => props.open ? (
  <div role="dialog" aria-label="Editar equipamento">
    <output>{JSON.stringify(props.equipamento)}</output>
    <button onClick={() => void props.onSave({ ...props.equipamento, anoFabricacao: "", potenciaCv: "", horimetro: "", especificacoes: " Nova plataforma " })}>Salvar sem números</button>
    <button onClick={() => void props.onSave({ ...props.equipamento, anoFabricacao: "2021", potenciaCv: "380", horimetro: "900" })}>Salvar com números</button>
  </div>) : null }));

const license = (overrides = {}) => ({ id: "lic-1", user: "owner-a", name: "João Souza", birth_date: "1980-01-01", cpf: "52998224725", rg: "123456789", mother_name: "Ana",
  nationality: "Brasileiro(a)", birth_place: "Rio Verde – GO", cnh_number: "12345678901", category: "AE", first_license_date: "2000-01-01", issue_date: "2025-01-01",
  expiration_date: "2030-01-01", issuing_state: "GO", issuing_authority: "DETRAN", situation: "active", acc: false, ear: true, points: 0, validation_status: "approved", ...overrides });
const certification = (overrides = {}) => ({ id: "cert-1", user: "owner-a", issuing_organization: "SENAR", title: "NR-31", issue_date: "2025-03-01",
  description: "Curso de segurança.", validation_status: "pending", ...overrides });

const rentals = [
  rentalDto({ id: "r-open", status: "signed", phase: "em_uso", allowed_actions: ["record_check_out", "complete", "cancel", "amend"], lessee_name: "Maria Silva", start_date: "2026-10-05T08:00:00Z", end_date: "2026-10-06T18:00:00Z", created_at: "2026-09-20T10:00:00Z", contract_id: "c-open", contract_number: "FR-OPEN", accepted_by_lessee: true, accepted_by_lessor: true,
    meter: { check_in: { id: "m1", value: 1200, recorded_at: "2026-10-05T08:00:00Z" }, check_out: null, hours_used: null, reference_hours: 8 } }),
  rentalDto({ id: "r-sign", status: "active", phase: "aguardando_assinaturas", allowed_actions: ["sign", "cancel"], lessee_name: "Pedro Lima", machine_model: "S780", contract_id: "c-sign", contract_number: "FR-SIGN", accepted_by_lessee: true, accepted_by_lessor: false, signature_deadline: "2026-10-03T12:00:00Z" }),
  rentalDto({ id: "r-pay", status: "awaiting_payment", lessee_name: "Ana Reis", machine_model: "S700", contract_status: "draft", contract_number: "FR-PAY" }),
  rentalDto({ id: "r-done", status: "completed", allowed_actions: ["review"], lessee_name: "Rita Alves", start_date: "2025-09-01T08:00:00Z", end_date: "2025-09-02T18:00:00Z", contract_id: "c-done", contract_number: "FR-DONE", accepted_by_lessee: true, accepted_by_lessor: true }),
];

function api(routes: Record<string, Route> = {}) {
  serve(net.http, {
    "GET users/owner-a": () => userDto({ id: "owner-a", name: "João Souza", role: "locador" }),
    "GET machines": () => [machineDto(), machineDto({ id: "machine-b", brand: "Case", model: "Magnum", year: 2024, status: "maintenance", usage_purpose: null, power_cv: null, hour_meter: null }), machineDto({ id: "machine-c", model: "6110J", status: "inactive", year: null })],
    "GET postings": () => [postingListDto({ machinery: "machine-a", primary_photo_url: "https://cdn/p.jpg" }), postingListDto({ id: "posting-b", machinery: "machine-b", machine_brand: "Case", machine_model: "Magnum", status: "draft", machine_year: 2024 }), postingListDto({ id: "alheio", machinery: "outra-maquina" })],
    "GET rentals": () => rentals,
    "GET reviews": () => [],
    "GET operator-licenses": () => [license(), license({ id: "lic-2", validation_status: "rejected", review_note: "Foto ilegível" }), license({ id: "lic-3", validation_status: "pending" })],
    "GET certifications": () => [certification(), certification({ id: "cert-2", validation_status: "approved" }), certification({ id: "cert-3", validation_status: "rejected", review_note: "Sem carimbo" })],
    "GET machines/machine-a/usage": () => ({ locacoes_concluidas: 0, diarias: 0, locacoes_com_leitura: 0, horas_registradas: 0, media_horas_por_diaria: null, referencia_horas_por_diaria: 8, ultima_leitura: null }),
    "GET machines/machine-b/usage": () => ({ locacoes_concluidas: 0, diarias: 0, locacoes_com_leitura: 0, horas_registradas: 0, media_horas_por_diaria: null, referencia_horas_por_diaria: 8, ultima_leitura: null }),
    "GET machines/machine-c/usage": () => ({ locacoes_concluidas: 0, diarias: 0, locacoes_com_leitura: 0, horas_registradas: 0, media_horas_por_diaria: null, referencia_horas_por_diaria: 8, ultima_leitura: null }),
    ...routes,
  });
}
const open = (tab: string, hash = "") => renderWithProviders(<DashboardLocador />, { queryClient: net.queryClient, route: `/dashboard?tab=${tab}${hash}`, path: "/dashboard" });
const card = (text: string) => screen.getByText(text).closest("[id^='locacao-']") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  localStorage.clear(); net.http.send.mockReset(); net.queryClient.clear(); ui.logout.mockReset(); Object.values(ui.toast).forEach(fn => fn.mockReset());
});
afterEach(() => { vi.useRealTimers(); });

it("greets the owner and links recent rentals to their detail", async () => {
  api(); const { user } = open("dashboard");
  expect(await screen.findByRole("heading", { name: "Bom dia, João" })).toBeInTheDocument();
  expect(screen.getByText("Sem avaliações")).toBeInTheDocument();
  const link = screen.getAllByRole("link").find(anchor => anchor.getAttribute("href") === "/dashboard?tab=reservas#locacao-r-open");
  expect(link).toHaveTextContent("Maria Silva");
  await user.click(screen.getByRole("button", { name: /Ver todas/ }));
  expect(await screen.findByText("Pedro Lima")).toBeInTheDocument();
});

it("offers a retry when a section fails to load", async () => {
  api({ "GET rentals": () => { throw new ServerError(500); } });
  const { user } = open("reservas");
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Não foi possível carregar todos os dados desta seção.");
  api();
  await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
});

it("shows machine status and edits a machine, sending empty numbers as null", async () => {
  api({ "PATCH machines/machine-b": () => machineDto({ id: "machine-b" }) });
  const { user } = open("frota");
  expect(await screen.findByText("Em manutenção")).toBeInTheDocument();
  expect(screen.getByText("Inativo")).toBeInTheDocument();
  expect(screen.getByText("Finalidade: Não informada")).toBeInTheDocument();
  // Ordem da frota: John Deere S790, Case Magnum, John Deere 6110J.
  await user.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
  const dialog = await screen.findByRole("dialog", { name: "Editar equipamento" });
  expect(JSON.parse(within(dialog).getByRole("status").textContent!)).toMatchObject({ id: "machine-b", marca: "Case", potenciaCv: "", horimetro: "", finalidade: "" });
  await user.click(within(dialog).getByRole("button", { name: "Salvar sem números" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Equipamento atualizado com sucesso!"));
  expect(net.http.send).toHaveBeenCalledWith({ method: "PATCH", path: "machines/machine-b", body: expect.objectContaining({ year: null, power_cv: null, hour_meter: null, technical_specifications: "Nova plataforma" }) });
});

it("edits a machine with numeric readings", async () => {
  api({ "PATCH machines/machine-a": () => machineDto() });
  const { user } = open("frota");
  await screen.findByText("Em manutenção");
  await user.click(screen.getAllByRole("button", { name: /Editar/ })[0]);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Salvar com números" }));
  await vi.waitFor(() => expect(net.http.send).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ year: 2021, power_cv: 380, hour_meter: 900 }) })));
});

it("tells the owner when no machine matches the search", async () => {
  api(); const { user } = open("frota");
  await screen.findByText("Em manutenção");
  await user.type(screen.getByRole("textbox", { name: "Buscar por marca, modelo ou registro..." }), "pulverizador");
  expect(screen.getByText("Nenhum equipamento encontrado.")).toBeInTheDocument();
});

it("lists only the owner's postings and filters them", async () => {
  api(); const { user } = open("anuncios");
  expect(await screen.findByRole("img", { name: "John Deere S790" })).toHaveAttribute("src", "https://cdn/p.jpg");
  expect(screen.getByText("Rascunho")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(2);
  await user.type(screen.getByRole("textbox", { name: "Buscar por maquinário ou localização..." }), "magnum");
  expect(screen.getAllByRole("heading", { level: 4 }).map(h => h.textContent)).toEqual(["Case Magnum"]);
  await user.clear(screen.getByRole("textbox", { name: "Buscar por maquinário ou localização..." }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Ano" }), "2024");
  expect(screen.getAllByRole("heading", { level: 4 }).map(h => h.textContent)).toEqual(["Case Magnum"]);
});

it("shows document review results and removes a CNH or certification", async () => {
  api({ "DELETE operator-licenses/lic-1": () => null, "DELETE certifications/cert-1": () => { throw new ServerError(500); } });
  const { user } = open("documentos");
  expect(await screen.findByText("Foto ilegível")).toBeInTheDocument();
  expect(screen.getByText("Sem carimbo")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Editar CNH/ })).toHaveAttribute("href", "/document/cnh");
  await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("CNH removida com sucesso!"));
  const certRemove = screen.getAllByRole("button", { name: "Remover" })[3];
  await user.click(certRemove);
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível remover a certificação."));
});

it("invites the owner to add documents when there are none", async () => {
  api({ "GET operator-licenses": () => [], "GET certifications": () => [], "DELETE operator-licenses/lic-1": () => { throw new ServerError(500); } });
  open("documentos");
  expect(await screen.findByText("Nenhuma CNH cadastrada")).toBeInTheDocument();
  expect(screen.getByText("Nenhuma certificação cadastrada")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Nova CNH/ })).toBeInTheDocument();
});

it("reports a failed CNH removal and removes a certification", async () => {
  api({ "DELETE operator-licenses/lic-1": () => { throw new ServerError(500); }, "DELETE certifications/cert-1": () => null });
  const { user } = open("documentos");
  await screen.findByText("Foto ilegível");
  await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível remover a CNH."));
  await user.click(screen.getAllByRole("button", { name: "Remover" })[3]);
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Certificação removida com sucesso!"));
});

it("records the return reading, relays server warnings and completes the rental", async () => {
  api({
    "POST rentals/r-open/meter-readings": () => ({ rental: rentals[0], warnings: ["Uso acima da referência."] }),
    "POST rentals/r-open/complete": () => ({ ...rentals[0], status: "completed" }),
  });
  const { user } = open("reservas");
  const rental = await screen.findByText("Maria Silva").then(() => card("Maria Silva"));
  await user.click(within(rental).getByRole("button", { name: /Registrar devolução/ }));
  await user.type(within(rental).getByLabelText("Leitura (horas)"), "1220");
  await user.click(within(rental).getByRole("button", { name: "Salvar leitura" }));
  await vi.waitFor(() => expect(ui.toast.warning).toHaveBeenCalledWith("Uso acima da referência."));
  expect(ui.toast.success).toHaveBeenCalledWith("Leitura do horímetro registrada.");
  await user.click(within(rental).getByRole("button", { name: /Concluir locação/ }));
  await user.type(within(rental).getByLabelText(/Leitura de devolução/), "1220");
  await user.click(within(rental).getByRole("button", { name: "Confirmar conclusão" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Locação concluída."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "rentals/r-open/complete", body: { final_hour_meter: 1220 } });
});

it("keeps the meter form open when the server refuses a reading or completion", async () => {
  api({
    "POST rentals/r-open/meter-readings": () => { throw new ConflictError("Leitura menor que a retirada."); },
    "POST rentals/r-open/complete": () => { throw "boom"; },
  });
  const { user } = open("reservas");
  const rental = await screen.findByText("Maria Silva").then(() => card("Maria Silva"));
  await user.click(within(rental).getByRole("button", { name: /Registrar devolução/ }));
  await user.type(within(rental).getByLabelText("Leitura (horas)"), "10");
  await user.click(within(rental).getByRole("button", { name: "Salvar leitura" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Leitura menor que a retirada."));
  await user.click(within(rental).getByRole("button", { name: /Concluir locação/ }));
  await user.click(within(rental).getByRole("button", { name: "Confirmar conclusão" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível concluir a locação."));
  expect(within(rental).getByRole("group", { name: "Concluir locação" })).toBeInTheDocument();
});

it("cancels a reservation after reviewing the refund policy", async () => {
  api({
    "GET rentals/r-sign/cancellation": () => ({ allowed: true, refund_amount: "1600.00", retained_amount: "80.00", reason_code: "owner", policy_text: "Estorno integral.", policy_version: "1" }),
    "POST rentals/r-sign/cancel": () => ({ ...rentals[1], status: "cancelled" }),
  });
  const { user } = open("reservas");
  const rental = await screen.findByText("Pedro Lima").then(() => card("Pedro Lima"));
  expect(within(rental).getByText(/Assine até/)).toBeInTheDocument();
  await user.click(within(rental).getByRole("button", { name: "Cancelar reserva" }));
  expect(await within(rental).findByText("Estorno integral.")).toBeInTheDocument();
  await user.type(within(rental).getByLabelText(/Motivo do cancelamento/), "Máquina quebrou");
  await user.click(within(rental).getByRole("button", { name: "Confirmar cancelamento" }));
  await vi.waitFor(() => expect(ui.toast.success).toHaveBeenCalledWith("Reserva cancelada. As datas foram liberadas."));
  expect(net.http.send).toHaveBeenCalledWith({ method: "POST", path: "rentals/r-sign/cancel", body: { reason: "Máquina quebrou" } });
});

it("explains a refused cancellation", async () => {
  api({
    "GET rentals/r-sign/cancellation": () => ({ allowed: true, refund_amount: "0", retained_amount: "0", reason_code: "x", policy_text: "Sem estorno.", policy_version: "1" }),
    "POST rentals/r-sign/cancel": () => { throw "boom"; },
  });
  const { user } = open("reservas");
  const rental = await screen.findByText("Pedro Lima").then(() => card("Pedro Lima"));
  await user.click(within(rental).getByRole("button", { name: "Cancelar reserva" }));
  await within(rental).findByText("Sem estorno.");
  await user.click(within(rental).getByRole("button", { name: "Confirmar cancelamento" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Não foi possível recusar a reserva."));
});

it("opens the date amendment dialog and the contract analysis", async () => {
  api(); const { user } = open("reservas");
  const rental = await screen.findByText("Maria Silva").then(() => card("Maria Silva"));
  expect(within(rental).getByRole("link", { name: /Analisar/ })).toHaveAttribute("href", "/contrato/r-open");
  await user.click(within(rental).getByRole("button", { name: "Alterar datas" }));
  expect(screen.getByRole("dialog", { name: "Alterar datas" })).toHaveTextContent("r-open");
  await user.click(screen.getByRole("button", { name: "Fechar alteração" }));
  expect(screen.queryByRole("dialog", { name: "Alterar datas" })).not.toBeInTheDocument();
});

it("requires a comment before reviewing a tenant and reports review failures", async () => {
  api({ "POST reviews": () => { throw new ConflictError("Locação já avaliada."); } });
  const { user } = open("reservas");
  const rental = await screen.findByText("Rita Alves").then(() => card("Rita Alves"));
  await user.click(within(rental).getByRole("button", { name: /Ver Detalhes/ }));
  expect(within(rental).getByText("Detalhes da Locação")).toBeInTheDocument();
  await user.click(within(rental).getByRole("button", { name: /Ver Detalhes/ }));
  await user.click(within(rental).getByRole("button", { name: /Avaliar Locatário/ }));
  await user.click(within(rental).getByRole("button", { name: "Enviar Avaliação" }));
  expect(ui.toast.error).toHaveBeenCalledWith("Por favor, escreva um comentário.");
  await user.type(within(rental).getByPlaceholderText("Conte como foi a experiência..."), "Cuidou bem da máquina.");
  await user.click(within(rental).getByRole("button", { name: "Enviar Avaliação" }));
  await vi.waitFor(() => expect(ui.toast.error).toHaveBeenCalledWith("Locação já avaliada."));
});

it("groups contracts by signature state and lets the owner sign pending ones", async () => {
  api(); const { user } = open("contratos");
  const contractCard = (title: string) => screen.getByRole("heading", { name: title }).parentElement!.parentElement!.parentElement!;
  await screen.findByRole("heading", { name: "FR-OPEN — John Deere S790" });
  expect(contractCard("FR-OPEN — John Deere S790")).toHaveTextContent("Assinado");
  expect(contractCard("FR-DONE — John Deere S790")).toHaveTextContent("Encerrado");
  expect(contractCard("FR-PAY — John Deere S700")).toHaveTextContent("Aguardando Pagamento");
  expect(contractCard("FR-SIGN — John Deere S780")).toHaveTextContent("Assinatura Pendente");
  await user.click(screen.getByRole("button", { name: /Assinar Contrato/ }));
  expect(screen.getByRole("dialog", { name: "Assinar contrato" })).toHaveTextContent("r-sign");
  await user.click(screen.getByRole("button", { name: "Concluir assinatura" }));
  expect(screen.queryByRole("dialog", { name: "Assinar contrato" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Assinar Contrato/ }));
  await user.click(screen.getByRole("button", { name: "Fechar assinatura" }));
  await user.click(screen.getByRole("button", { name: "Encerrados" }));
  expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toEqual(["FR-DONE — John Deere S790"]);
});

it.each([["chat", "Chat: Converse com seus locatários"], ["notificacoes", "Painel de notificações"], ["conta", "Seção da conta"], ["avaliacoes", "Avaliações Recebidas"]])(
  "shows the %s tab", async (tab, text) => {
    api(); open(tab);
    expect(await screen.findAllByText(text)).not.toHaveLength(0);
  },
);

it("switches tabs from the sidebar and confirms before logging out", async () => {
  api(); const { user } = open("unknown");
  expect(await screen.findByRole("heading", { name: "Bom dia, João" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  await user.click(screen.getByRole("button", { name: /Minha frota/ }));
  expect(await screen.findByRole("heading", { name: "Minha Frota" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Sair/ }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sair" }));
  expect(ui.logout).toHaveBeenCalled();
});
